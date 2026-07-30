[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Inspect", "Publish", "FlushDirectory")]
  [string]$Mode,

  [string]$Path,
  [string]$SourcePath,
  [string]$DestinationPath,
  [string]$ExpectedSha256,
  [long]$ExpectedBytes = -1
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

public sealed class G006BNativeFileInfo
{
    public string VolumeSerialNumber { get; set; }
    public string FileId { get; set; }
    public long Size { get; set; }
    public uint NumberOfLinks { get; set; }
    public uint Attributes { get; set; }
    public string FileSystem { get; set; }
    public string Sha256 { get; set; }
}

public static class G006BNativeFile
{
    private const uint GENERIC_READ = 0x80000000;
    private const uint GENERIC_WRITE = 0x40000000;
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint FILE_SHARE_WRITE = 0x00000002;
    private const uint FILE_SHARE_DELETE = 0x00000004;
    private const uint OPEN_EXISTING = 3;
    private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
    private const uint FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;
    private const uint MOVEFILE_WRITE_THROUGH = 0x00000008;
    private const int FileStandardInfo = 1;
    private const int FileIdInfo = 18;
    private const int CfSyncRootInfoBasic = 0;
    private const uint HResultCloudFileNotUnderSyncRoot = 0x80070186;
    private const uint HResultNotACloudSyncRoot = 0x80070195;
    private const uint HResultNotAReparsePoint = 0x80071126;

    [StructLayout(LayoutKind.Sequential)]
    private struct FILE_STANDARD_INFO
    {
        public long AllocationSize;
        public long EndOfFile;
        public uint NumberOfLinks;
        [MarshalAs(UnmanagedType.Bool)] public bool DeletePending;
        [MarshalAs(UnmanagedType.Bool)] public bool Directory;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct FILE_ID_128
    {
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
        public byte[] Identifier;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct FILE_ID_INFO
    {
        public ulong VolumeSerialNumber;
        public FILE_ID_128 FileId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct CF_SYNC_ROOT_BASIC_INFO
    {
        public long SyncRootFileId;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(
        string fileName,
        uint desiredAccess,
        uint shareMode,
        IntPtr securityAttributes,
        uint creationDisposition,
        uint flagsAndAttributes,
        IntPtr templateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetFileInformationByHandleEx(
        SafeFileHandle file,
        int informationClass,
        IntPtr information,
        uint bufferSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool FlushFileBuffers(SafeFileHandle file);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool MoveFileExW(string existingName, string newName, uint flags);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DeleteFileW(string fileName);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFileAttributesW(string fileName);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetVolumePathNameW(string fileName, StringBuilder volumePath, uint bufferLength);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetVolumeInformationW(
        string rootPath,
        StringBuilder volumeName,
        uint volumeNameSize,
        out uint serialNumber,
        out uint maximumComponentLength,
        out uint fileSystemFlags,
        StringBuilder fileSystemName,
        uint fileSystemNameSize);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern uint GetDriveTypeW(string rootPath);

    [DllImport("CldApi.dll", CharSet = CharSet.Unicode)]
    private static extern int CfGetSyncRootInfoByPath(
        string filePath,
        int infoClass,
        IntPtr infoBuffer,
        uint infoBufferLength,
        IntPtr returnedLength);

    private static SafeFileHandle Open(string path, uint access, bool directory)
    {
        uint flags = FILE_FLAG_OPEN_REPARSE_POINT | (directory ? FILE_FLAG_BACKUP_SEMANTICS : 0u);
        SafeFileHandle handle = CreateFileW(
            path,
            access,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            IntPtr.Zero,
            OPEN_EXISTING,
            flags,
            IntPtr.Zero);
        if (handle.IsInvalid)
        {
            int error = Marshal.GetLastWin32Error();
            handle.Dispose();
            throw new Win32Exception(error, "CreateFileW failed for " + path);
        }
        return handle;
    }

    private static T ReadInfo<T>(SafeFileHandle handle, int informationClass) where T : struct
    {
        int size = Marshal.SizeOf(typeof(T));
        IntPtr buffer = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(default(T), buffer, false);
            if (!GetFileInformationByHandleEx(handle, informationClass, buffer, (uint)size))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "GetFileInformationByHandleEx failed");
            }
            return (T)Marshal.PtrToStructure(buffer, typeof(T));
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static string FileSystemFor(string path)
    {
        StringBuilder root = new StringBuilder(512);
        if (!GetVolumePathNameW(path, root, (uint)root.Capacity))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "GetVolumePathNameW failed");
        }
        StringBuilder volumeName = new StringBuilder(512);
        StringBuilder fileSystem = new StringBuilder(64);
        uint serial;
        uint maximumComponentLength;
        uint fileSystemFlags;
        if (!GetVolumeInformationW(
            root.ToString(),
            volumeName,
            (uint)volumeName.Capacity,
            out serial,
            out maximumComponentLength,
            out fileSystemFlags,
            fileSystem,
            (uint)fileSystem.Capacity))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "GetVolumeInformationW failed");
        }
        if (GetDriveTypeW(root.ToString()) != 3)
        {
            throw new InvalidOperationException("only a local fixed drive is supported: " + root.ToString());
        }
        return fileSystem.ToString();
    }

    public static G006BNativeFileInfo Inspect(string path, bool directory)
    {
        using (SafeFileHandle handle = Open(path, GENERIC_READ, directory))
        {
            FILE_STANDARD_INFO standard = ReadInfo<FILE_STANDARD_INFO>(handle, FileStandardInfo);
            FILE_ID_INFO identity = ReadInfo<FILE_ID_INFO>(handle, FileIdInfo);
            uint attributes = GetFileAttributesW(path);
            if (attributes == 0xFFFFFFFF)
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "GetFileAttributesW failed");
            }
            StringBuilder id = new StringBuilder(32);
            foreach (byte value in identity.FileId.Identifier)
            {
                id.Append(value.ToString("x2"));
            }
            string sha256 = null;
            if (!directory)
            {
                using (SHA256 algorithm = SHA256.Create())
                using (FileStream stream = new FileStream(handle, FileAccess.Read, 65536, false))
                {
                    StringBuilder digest = new StringBuilder(64);
                    foreach (byte value in algorithm.ComputeHash(stream))
                    {
                        digest.Append(value.ToString("x2"));
                    }
                    sha256 = digest.ToString();
                }
            }
            return new G006BNativeFileInfo
            {
                VolumeSerialNumber = identity.VolumeSerialNumber.ToString(),
                FileId = id.ToString(),
                Size = standard.EndOfFile,
                NumberOfLinks = standard.NumberOfLinks,
                Attributes = attributes,
                FileSystem = FileSystemFor(path),
                Sha256 = sha256
            };
        }
    }

    public static void FlushFile(string path)
    {
        using (SafeFileHandle handle = Open(path, GENERIC_READ | GENERIC_WRITE, false))
        {
            if (!FlushFileBuffers(handle))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "FlushFileBuffers failed for file " + path);
            }
        }
    }

    public static void FlushDirectory(string path)
    {
        using (SafeFileHandle handle = Open(path, GENERIC_READ | GENERIC_WRITE, true))
        {
            if (!FlushFileBuffers(handle))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "FlushFileBuffers failed for directory " + path);
            }
        }
    }

    public static void AssertNotCloudSyncRoot(string path)
    {
        int size = Marshal.SizeOf(typeof(CF_SYNC_ROOT_BASIC_INFO));
        IntPtr buffer = Marshal.AllocHGlobal(size);
        try
        {
            int status = CfGetSyncRootInfoByPath(
                path,
                CfSyncRootInfoBasic,
                buffer,
                (uint)size,
                IntPtr.Zero);
            if (status == 0)
            {
                throw new InvalidOperationException("cloud sync-root path rejected: " + path);
            }
            uint hresult = unchecked((uint)status);
            if (hresult != HResultCloudFileNotUnderSyncRoot &&
                hresult != HResultNotACloudSyncRoot &&
                hresult != HResultNotAReparsePoint)
            {
                Marshal.ThrowExceptionForHR(status);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    public static void MoveNoReplaceWriteThroughRetained(string source, string destination)
    {
        using (SafeFileHandle retained = Open(source, GENERIC_READ | GENERIC_WRITE, false))
        {
            if (!FlushFileBuffers(retained))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "FlushFileBuffers failed for retained source handle");
            }
            if (!MoveFileExW(source, destination, MOVEFILE_WRITE_THROUGH))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "MoveFileExW(MOVEFILE_WRITE_THROUGH) failed");
            }
            if (!FlushFileBuffers(retained))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "FlushFileBuffers failed for retained published handle");
            }
        }
    }

    public static void DeleteOwnedTemporary(string path)
    {
        if (!DeleteFileW(path))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "DeleteFileW failed for owned temporary " + path);
        }
    }
}
'@

function Throw-G006BError {
  param([int]$ExitCode, [string]$Message)
  $exception = [InvalidOperationException]::new($Message)
  $exception.Data["G006BExitCode"] = $ExitCode
  throw $exception
}

function Assert-G006BCanonicalPath {
  param([string]$Candidate, [bool]$MustExist, [bool]$Directory)
  if ([string]::IsNullOrWhiteSpace($Candidate)) {
    Throw-G006BError 10 "path is required"
  }
  if ($Candidate.StartsWith("\\", [StringComparison]::Ordinal) -or
      $Candidate.StartsWith("//", [StringComparison]::Ordinal) -or
      $Candidate.StartsWith("\\?\", [StringComparison]::Ordinal) -or
      $Candidate.StartsWith("\\.\", [StringComparison]::Ordinal)) {
    Throw-G006BError 10 "UNC and device paths are rejected"
  }
  if (-not [IO.Path]::IsPathRooted($Candidate) -or $Candidate -cnotmatch '^[A-Z]:\\') {
    Throw-G006BError 10 "path must be absolute"
  }
  $full = [IO.Path]::GetFullPath($Candidate)
  if (-not [string]::Equals($full, $Candidate, [StringComparison]::Ordinal)) {
    Throw-G006BError 10 "path must already be canonical"
  }
  if ($Candidate.Substring(2).Contains(":")) {
    Throw-G006BError 10 "alternate data streams are rejected"
  }
  if ($MustExist -and -not (Test-Path -LiteralPath $Candidate)) {
    Throw-G006BError 10 "required path does not exist"
  }
  if ($MustExist) {
    $item = Get-Item -LiteralPath $Candidate -Force
    if ($Directory -ne [bool]$item.PSIsContainer) {
      Throw-G006BError 10 "path kind mismatch"
    }
  }
  return $full
}

function Assert-G006BAttributes {
  param([string]$Candidate, [bool]$Directory)
  $item = Get-Item -LiteralPath $Candidate -Force
  $attributes = [uint32]$item.Attributes
  $rejected = [uint32]([IO.FileAttributes]::ReparsePoint) -bor 0x00001000 -bor 0x00040000 -bor 0x00400000
  if (($attributes -band $rejected) -ne 0) {
    Throw-G006BError 10 "reparse, offline, or cloud-recall path rejected"
  }
  if ($Directory -ne [bool]$item.PSIsContainer) {
    Throw-G006BError 10 "non-regular path rejected"
  }
}

function Assert-G006BNotCloudSyncRoot {
  param([string]$Candidate)
  try {
    [G006BNativeFile]::AssertNotCloudSyncRoot($Candidate)
  } catch {
    Throw-G006BError 10 ("cloud sync-root status rejected path: " + $Candidate + "; " + $_.Exception.Message)
  }
}

function Assert-G006BParentChain {
  param([string]$Candidate)
  $current = Get-Item -LiteralPath $Candidate -Force
  while ($null -ne $current) {
    Assert-G006BAttributes $current.FullName $true
    Assert-G006BNotCloudSyncRoot $current.FullName
    $current = $current.Parent
  }
}

function Assert-G006BTrustedParentAcl {
  param([string]$Candidate)
  $acl = Get-Acl -LiteralPath $Candidate
  $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $ownerSid = ([Security.Principal.NTAccount]$acl.Owner).Translate([Security.Principal.SecurityIdentifier]).Value
  $trustedOwners = @($currentSid, 'S-1-5-18', 'S-1-5-32-544')
  if ($trustedOwners -cnotcontains $ownerSid) {
    Throw-G006BError 10 "destination parent owner is not trusted"
  }
  $broadSids = @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545', 'S-1-5-32-546')
  $writeRights = [Security.AccessControl.FileSystemRights]::Write -bor
    [Security.AccessControl.FileSystemRights]::Modify -bor
    [Security.AccessControl.FileSystemRights]::FullControl -bor
    [Security.AccessControl.FileSystemRights]::Delete -bor
    [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
    [Security.AccessControl.FileSystemRights]::CreateFiles -bor
    [Security.AccessControl.FileSystemRights]::CreateDirectories
  foreach ($rule in $acl.Access) {
    $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
        $broadSids -ccontains $sid -and
        (($rule.FileSystemRights -band $writeRights) -ne 0)) {
      Throw-G006BError 10 "destination parent grants broad write or delete rights"
    }
  }
}

function Get-G006BFileResult {
  param([string]$Candidate, [string]$Status)
  $native = [G006BNativeFile]::Inspect($Candidate, $false)
  if ($native.FileSystem -cne "NTFS") {
    Throw-G006BError 10 "only local NTFS is supported"
  }
  if ($native.NumberOfLinks -ne 1) {
    Throw-G006BError 10 "hard-linked files are rejected"
  }
  $attributes = [uint32]$native.Attributes
  $rejected = [uint32]([IO.FileAttributes]::Directory) -bor [uint32]([IO.FileAttributes]::ReparsePoint) -bor 0x00001000 -bor 0x00040000 -bor 0x00400000
  if (($attributes -band $rejected) -ne 0) {
    Throw-G006BError 10 "non-regular, reparse, offline, or cloud-recall file rejected"
  }
  return [ordered]@{
    status = $Status
    path = $Candidate
    volumeSerialNumber = $native.VolumeSerialNumber
    fileId = $native.FileId
    size = $native.Size
    numberOfLinks = [int]$native.NumberOfLinks
    sha256 = $native.Sha256
    fileSystem = $native.FileSystem
  }
}

try {
  $publishDestination = $null
  if ($Mode -ceq "Inspect") {
    $canonical = Assert-G006BCanonicalPath $Path $true $false
    $inspectParent = [IO.Path]::GetDirectoryName($canonical)
    Assert-G006BParentChain $inspectParent
    Assert-G006BTrustedParentAcl $inspectParent
    Assert-G006BAttributes $canonical $false
    Assert-G006BNotCloudSyncRoot $canonical
    (Get-G006BFileResult $canonical "inspected" | ConvertTo-Json -Compress)
    exit 0
  }

  if ($Mode -ceq "FlushDirectory") {
    $canonical = Assert-G006BCanonicalPath $Path $true $true
    Assert-G006BParentChain $canonical
    Assert-G006BTrustedParentAcl $canonical
    $native = [G006BNativeFile]::Inspect($canonical, $true)
    if ($native.FileSystem -cne "NTFS") {
      Throw-G006BError 10 "only local NTFS is supported"
    }
    [G006BNativeFile]::FlushDirectory($canonical)
    ([ordered]@{ status = "directory-flushed"; path = $canonical; fileSystem = $native.FileSystem } | ConvertTo-Json -Compress)
    exit 0
  }

  if ($ExpectedSha256 -cnotmatch '^[0-9a-f]{64}$' -or $ExpectedBytes -lt 0) {
    Throw-G006BError 10 "expected lowercase SHA-256 and nonnegative byte count are required"
  }
  $source = Assert-G006BCanonicalPath $SourcePath $true $false
  $destination = Assert-G006BCanonicalPath $DestinationPath $false $false
  $sourceParent = [IO.Path]::GetDirectoryName($source)
  $destinationParent = [IO.Path]::GetDirectoryName($destination)
  if (-not [string]::Equals($sourceParent, $destinationParent, [StringComparison]::Ordinal)) {
    Throw-G006BError 10 "source temp and destination must be siblings"
  }
  if (-not [IO.Path]::GetFileName($source).StartsWith([IO.Path]::GetFileName($destination) + ".g006b.tmp.", [StringComparison]::Ordinal)) {
    Throw-G006BError 10 "source must be a destination-bound G-006B sibling temp"
  }
  Assert-G006BParentChain $sourceParent
  Assert-G006BTrustedParentAcl $sourceParent
  Assert-G006BAttributes $source $false
  Assert-G006BNotCloudSyncRoot $source
  $sourceInfo = Get-G006BFileResult $source "source"
  if ($sourceInfo.sha256 -cne $ExpectedSha256 -or $sourceInfo.size -ne $ExpectedBytes) {
    Throw-G006BError 11 "source bytes or SHA-256 do not match the explicit expectation"
  }

  if (Test-Path -LiteralPath $destination) {
    Assert-G006BAttributes $destination $false
    Assert-G006BNotCloudSyncRoot $destination
    $existing = Get-G006BFileResult $destination "existing"
    if ($existing.sha256 -cne $ExpectedSha256 -or $existing.size -ne $ExpectedBytes) {
      Throw-G006BError 11 "existing destination is not byte-identical"
    }
    [G006BNativeFile]::DeleteOwnedTemporary($source)
    [G006BNativeFile]::FlushDirectory($destinationParent)
    ($existing | ConvertTo-Json -Compress)
    exit 0
  }

  [G006BNativeFile]::FlushFile($source)
  $flushedSource = Get-G006BFileResult $source "flushed-source"
  if ($flushedSource.fileId -cne $sourceInfo.fileId -or
      $flushedSource.volumeSerialNumber -cne $sourceInfo.volumeSerialNumber -or
      $flushedSource.sha256 -cne $ExpectedSha256 -or
      $flushedSource.size -ne $ExpectedBytes) {
    Throw-G006BError 12 "source identity changed across flush"
  }
  $parentBefore = [G006BNativeFile]::Inspect($destinationParent, $true)
  $publishDestination = $destination
  [G006BNativeFile]::MoveNoReplaceWriteThroughRetained($source, $destination)
  [G006BNativeFile]::FlushDirectory($destinationParent)
  Assert-G006BParentChain $destinationParent
  Assert-G006BNotCloudSyncRoot $destination
  $parentAfter = [G006BNativeFile]::Inspect($destinationParent, $true)
  if ($parentAfter.fileId -cne $parentBefore.fileId -or
      $parentAfter.volumeSerialNumber -cne $parentBefore.volumeSerialNumber) {
    Throw-G006BError 14 "destination parent identity changed across publication"
  }
  $published = Get-G006BFileResult $destination "published"
  if ($published.fileId -cne $sourceInfo.fileId -or
      $published.volumeSerialNumber -cne $sourceInfo.volumeSerialNumber -or
      $published.sha256 -cne $ExpectedSha256 -or
      $published.size -ne $ExpectedBytes) {
    Throw-G006BError 14 "published file failed identity, byte-count, or SHA-256 verification"
  }
  ($published | ConvertTo-Json -Compress)
  exit 0
} catch {
  $exitCode = 15
  $publishedUnverified = $false
  if ($null -ne $publishDestination -and
      (Test-Path -LiteralPath $publishDestination) -and
      -not (Test-Path -LiteralPath $SourcePath)) {
    $publishedUnverified = $true
  }
  if ($publishedUnverified) {
    $exitCode = 14
  } elseif ($_.Exception.Data.Contains("G006BExitCode")) {
    $exitCode = [int]$_.Exception.Data["G006BExitCode"]
  } elseif ($_.Exception.Message -match 'MoveFileExW') {
    $exitCode = 13
  } elseif ($_.Exception.Message -match 'FlushFileBuffers') {
    $exitCode = 12
  }
  if ($publishedUnverified) {
    [Console]::Error.WriteLine("G006B_PUBLISHED_UNVERIFIED_RECOVERY_REQUIRED: " + $_.Exception.Message)
  } else {
    [Console]::Error.WriteLine($_.Exception.Message)
  }
  exit $exitCode
}
