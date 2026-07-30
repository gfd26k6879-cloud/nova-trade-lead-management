[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("InspectFile", "PublishFile", "FlushDirectory", "LeaseDatabase", "CleanupOwned", "CleanupOwnedTree")]
  [string]$Mode,

  [string]$Path,
  [string]$SourcePath,
  [string]$DestinationPath,
  [string]$LockPath,
  [string]$Kind,
  [string]$ExpectedSha256,
  [long]$ExpectedBytes = -1,
  [string]$ExpectedVolumeSerialNumber,
  [string]$ExpectedFileId
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

public sealed class G006BNativeIdentity
{
    public string VolumeSerialNumber { get; set; }
    public string FileId { get; set; }
    public long Size { get; set; }
    public uint NumberOfLinks { get; set; }
    public uint Attributes { get; set; }
    public string FinalPath { get; set; }
    public string Sha256 { get; set; }
    public string FileSystem { get; set; }
}

public sealed class G006BNativeLease : IDisposable
{
    internal SafeFileHandle Handle;
    internal readonly bool Directory;
    internal readonly string OpenedPath;

    internal G006BNativeLease(SafeFileHandle handle, bool directory, string openedPath)
    {
        Handle = handle;
        Directory = directory;
        OpenedPath = openedPath;
    }

    public void Dispose()
    {
        SafeFileHandle handle = Handle;
        Handle = null;
        if (handle != null) handle.Dispose();
    }
}

public static class G006BNativeFile
{
    private const uint GENERIC_READ = 0x80000000;
    private const uint GENERIC_WRITE = 0x40000000;
    private const uint DELETE = 0x00010000;
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint FILE_SHARE_WRITE = 0x00000002;
    private const uint FILE_SHARE_DELETE = 0x00000004;
    private const uint CREATE_NEW = 1;
    private const uint OPEN_EXISTING = 3;
    private const uint FILE_ATTRIBUTE_NORMAL = 0x00000080;
    private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
    private const uint FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;
    private const uint MOVEFILE_WRITE_THROUGH = 0x00000008;
    private const int FileBasicInfo = 0;
    private const int FileStandardInfo = 1;
    private const int FileDispositionInfo = 4;
    private const int FileIdInfo = 18;
    private const int CfSyncRootInfoBasic = 0;
    private const uint HResultCloudFileNotUnderSyncRoot = 0x80070186;
    private const uint HResultNotACloudSyncRoot = 0x80070195;
    private const uint HResultNotAReparsePoint = 0x80071126;

    [StructLayout(LayoutKind.Sequential)]
    private struct FILE_BASIC_INFO
    {
        public long CreationTime;
        public long LastAccessTime;
        public long LastWriteTime;
        public long ChangeTime;
        public uint FileAttributes;
    }

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
    private struct FILE_DISPOSITION_INFO
    {
        [MarshalAs(UnmanagedType.Bool)] public bool DeleteFile;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct CF_SYNC_ROOT_BASIC_INFO
    {
        public long SyncRootFileId;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(
        string fileName, uint desiredAccess, uint shareMode, IntPtr securityAttributes,
        uint creationDisposition, uint flagsAndAttributes, IntPtr templateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetFileInformationByHandleEx(
        SafeFileHandle file, int informationClass, IntPtr information, uint bufferSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetFileInformationByHandle(
        SafeFileHandle file, int informationClass, IntPtr information, uint bufferSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool FlushFileBuffers(SafeFileHandle file);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool MoveFileExW(string existingName, string newName, uint flags);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandleW(
        SafeFileHandle file, StringBuilder filePath, uint filePathSize, uint flags);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetFilePointerEx(
        SafeFileHandle file, long distance, out long newPosition, uint moveMethod);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ReadFile(
        SafeFileHandle file, byte[] buffer, uint bytesToRead, out uint bytesRead, IntPtr overlapped);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetVolumePathNameW(string fileName, StringBuilder volumePath, uint bufferLength);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetVolumeInformationW(
        string rootPath, StringBuilder volumeName, uint volumeNameSize, out uint serialNumber,
        out uint maximumComponentLength, out uint fileSystemFlags, StringBuilder fileSystemName,
        uint fileSystemNameSize);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern uint GetDriveTypeW(string rootPath);

    [DllImport("CldApi.dll", CharSet = CharSet.Unicode)]
    private static extern int CfGetSyncRootInfoByPath(
        string filePath, int infoClass, IntPtr infoBuffer, uint infoBufferLength, IntPtr returnedLength);

    private static G006BNativeLease Open(
        string path, uint access, uint share, bool directory, uint disposition)
    {
        uint flags = FILE_FLAG_OPEN_REPARSE_POINT |
            (directory ? FILE_FLAG_BACKUP_SEMANTICS : FILE_ATTRIBUTE_NORMAL);
        SafeFileHandle handle = CreateFileW(
            path, access, share, IntPtr.Zero, disposition, flags, IntPtr.Zero);
        if (handle.IsInvalid)
        {
            int error = Marshal.GetLastWin32Error();
            handle.Dispose();
            throw new Win32Exception(error, "CreateFileW failed error " + error + " for " + path);
        }
        return new G006BNativeLease(handle, directory, path);
    }

    public static G006BNativeLease OpenStableRead(string path, bool directory)
    {
        return Open(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_DELETE, directory, OPEN_EXISTING);
    }

    public static G006BNativeLease OpenSettledRead(string path)
    {
        return Open(path, GENERIC_READ, FILE_SHARE_READ, false, OPEN_EXISTING);
    }

    public static G006BNativeLease OpenDatabaseLease(string path)
    {
        return Open(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, false, OPEN_EXISTING);
    }

    public static G006BNativeLease OpenPublisherSource(string path)
    {
        return Open(path, GENERIC_READ | GENERIC_WRITE | DELETE, FILE_SHARE_READ | FILE_SHARE_DELETE, false, OPEN_EXISTING);
    }

    public static G006BNativeLease OpenParent(string path)
    {
        return Open(path, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, true, OPEN_EXISTING);
    }

    public static G006BNativeLease CreateLock(string path)
    {
        return Open(path, GENERIC_READ | GENERIC_WRITE | DELETE, 0, false, CREATE_NEW);
    }

    public static G006BNativeLease OpenOwnedForDelete(string path, bool directory)
    {
        return Open(path, GENERIC_READ | DELETE, FILE_SHARE_READ | FILE_SHARE_WRITE, directory, OPEN_EXISTING);
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
        finally { Marshal.FreeHGlobal(buffer); }
    }

    private static string FinalPath(SafeFileHandle handle)
    {
        StringBuilder result = new StringBuilder(32768);
        uint length = GetFinalPathNameByHandleW(handle, result, (uint)result.Capacity, 0);
        if (length == 0 || length >= result.Capacity)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "GetFinalPathNameByHandleW failed");
        string path = result.ToString();
        return path.StartsWith(@"\\?\", StringComparison.Ordinal) ? path.Substring(4) : path;
    }

    private static string FileSystemFor(string path)
    {
        StringBuilder root = new StringBuilder(512);
        if (!GetVolumePathNameW(path, root, (uint)root.Capacity))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "GetVolumePathNameW failed");
        if (GetDriveTypeW(root.ToString()) != 3)
            throw new InvalidOperationException("only a local fixed drive is supported");
        StringBuilder volume = new StringBuilder(512);
        StringBuilder fileSystem = new StringBuilder(64);
        uint serial, maximum, flags;
        if (!GetVolumeInformationW(root.ToString(), volume, (uint)volume.Capacity, out serial,
            out maximum, out flags, fileSystem, (uint)fileSystem.Capacity))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "GetVolumeInformationW failed");
        return fileSystem.ToString();
    }

    private static string Hash(SafeFileHandle handle)
    {
        long position;
        if (!SetFilePointerEx(handle, 0, out position, 0))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "SetFilePointerEx failed");
        using (SHA256 algorithm = SHA256.Create())
        {
            byte[] buffer = new byte[65536];
            uint read;
            do
            {
                if (!ReadFile(handle, buffer, (uint)buffer.Length, out read, IntPtr.Zero))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "ReadFile failed");
                if (read != 0) algorithm.TransformBlock(buffer, 0, (int)read, buffer, 0);
            } while (read != 0);
            algorithm.TransformFinalBlock(new byte[0], 0, 0);
            StringBuilder result = new StringBuilder(64);
            foreach (byte value in algorithm.Hash) result.Append(value.ToString("x2"));
            return result.ToString();
        }
    }

    public static G006BNativeIdentity Inspect(G006BNativeLease lease)
    {
        FILE_BASIC_INFO basic = ReadInfo<FILE_BASIC_INFO>(lease.Handle, FileBasicInfo);
        FILE_STANDARD_INFO standard = ReadInfo<FILE_STANDARD_INFO>(lease.Handle, FileStandardInfo);
        FILE_ID_INFO identity = ReadInfo<FILE_ID_INFO>(lease.Handle, FileIdInfo);
        StringBuilder id = new StringBuilder(32);
        foreach (byte value in identity.FileId.Identifier) id.Append(value.ToString("x2"));
        return new G006BNativeIdentity {
            VolumeSerialNumber = identity.VolumeSerialNumber.ToString(),
            FileId = id.ToString(),
            Size = standard.EndOfFile,
            NumberOfLinks = standard.NumberOfLinks,
            Attributes = basic.FileAttributes,
            FinalPath = FinalPath(lease.Handle),
            Sha256 = lease.Directory ? null : Hash(lease.Handle),
            FileSystem = FileSystemFor(lease.OpenedPath)
        };
    }

    public static void Flush(G006BNativeLease lease)
    {
        if (!FlushFileBuffers(lease.Handle))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "FlushFileBuffers failed");
    }

    public static int MoveNoReplaceWriteThrough(string source, string destination)
    {
        if (MoveFileExW(source, destination, MOVEFILE_WRITE_THROUGH)) return 0;
        return Marshal.GetLastWin32Error();
    }

    public static void MarkDelete(G006BNativeLease lease)
    {
        FILE_DISPOSITION_INFO info = new FILE_DISPOSITION_INFO { DeleteFile = true };
        int size = Marshal.SizeOf(typeof(FILE_DISPOSITION_INFO));
        IntPtr buffer = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(info, buffer, false);
            if (!SetFileInformationByHandle(lease.Handle, FileDispositionInfo, buffer, (uint)size))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "identity-safe delete disposition failed");
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }

    public static void AssertNotCloudSyncRoot(string path)
    {
        int size = Marshal.SizeOf(typeof(CF_SYNC_ROOT_BASIC_INFO));
        IntPtr buffer = Marshal.AllocHGlobal(size);
        try
        {
            int status = CfGetSyncRootInfoByPath(path, CfSyncRootInfoBasic, buffer, (uint)size, IntPtr.Zero);
            if (status == 0) throw new InvalidOperationException("cloud sync-root path rejected: " + path);
            uint value = unchecked((uint)status);
            if (value != HResultCloudFileNotUnderSyncRoot && value != HResultNotACloudSyncRoot && value != HResultNotAReparsePoint)
                Marshal.ThrowExceptionForHR(status);
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }
}
'@

function Throw-G006BError {
  param([int]$ExitCode, [string]$Message)
  $exception = [InvalidOperationException]::new($Message)
  $exception.Data['G006BExitCode'] = $ExitCode
  throw $exception
}

function Assert-CanonicalPath {
  param([string]$Candidate, [bool]$MustExist, [bool]$Directory)
  if ([string]::IsNullOrWhiteSpace($Candidate) -or
      $Candidate.StartsWith('\', [StringComparison]::Ordinal) -or
      $Candidate.StartsWith('//', [StringComparison]::Ordinal) -or
      -not [IO.Path]::IsPathRooted($Candidate) -or $Candidate -cnotmatch '^[A-Z]:\\') {
    Throw-G006BError 10 'canonical absolute drive-letter path required'
  }
  $full = [IO.Path]::GetFullPath($Candidate)
  if (-not [string]::Equals($full, $Candidate, [StringComparison]::Ordinal) -or $Candidate.Substring(2).Contains(':')) {
    Throw-G006BError 10 'path alias, traversal, device, or ADS rejected'
  }
  if ($MustExist -and -not (Test-Path -LiteralPath $Candidate)) { Throw-G006BError 10 'required path absent' }
  if ($MustExist) {
    $item = Get-Item -LiteralPath $Candidate -Force
    if ($Directory -ne [bool]$item.PSIsContainer) { Throw-G006BError 10 'path kind mismatch' }
  }
  return $full
}

function Assert-NotCloud {
  param([string]$Candidate)
  try { [G006BNativeFile]::AssertNotCloudSyncRoot($Candidate) }
  catch { Throw-G006BError 10 ('cloud status rejected: ' + $_.Exception.Message) }
}

function Assert-PathChain {
  param([string]$Candidate)
  $current = Get-Item -LiteralPath $Candidate -Force
  while ($null -ne $current) {
    $attributes = [uint32]$current.Attributes
    $rejected = [uint32]([IO.FileAttributes]::ReparsePoint) -bor 0x00001000 -bor 0x00040000 -bor 0x00400000
    if (($attributes -band $rejected) -ne 0) { Throw-G006BError 10 'reparse, offline, or cloud-recall path rejected' }
    Assert-NotCloud $current.FullName
    $current = $current.Parent
  }
}

function Assert-TrustedParentAcl {
  param([string]$Candidate)
  $acl = Get-Acl -LiteralPath $Candidate
  $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $ownerSid = ([Security.Principal.NTAccount]$acl.Owner).Translate([Security.Principal.SecurityIdentifier]).Value
  if (@($currentSid, 'S-1-5-18', 'S-1-5-32-544') -cnotcontains $ownerSid) { Throw-G006BError 10 'untrusted parent owner' }
  $broad = @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545', 'S-1-5-32-546')
  $write = [Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Modify -bor
    [Security.AccessControl.FileSystemRights]::FullControl -bor [Security.AccessControl.FileSystemRights]::Delete -bor
    [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::CreateFiles -bor
    [Security.AccessControl.FileSystemRights]::CreateDirectories
  foreach ($rule in $acl.Access) {
    $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $broad -ccontains $sid -and (($rule.FileSystemRights -band $write) -ne 0)) {
      Throw-G006BError 10 'broad parent write/delete ACL rejected'
    }
  }
}

function Convert-Identity {
  param([G006BNativeIdentity]$Identity, [string]$Status, [bool]$Directory = $false)
  if ($Identity.FileSystem -cne 'NTFS' -or (-not $Directory -and $Identity.NumberOfLinks -ne 1)) { Throw-G006BError 10 'local NTFS single-link identity required' }
  $rejected = [uint32]([IO.FileAttributes]::ReparsePoint) -bor 0x00001000 -bor 0x00040000 -bor 0x00400000
  if (($Identity.Attributes -band $rejected) -ne 0) { Throw-G006BError 10 'handle attributes rejected' }
  return [ordered]@{
    status = $Status
    volumeSerialNumber = $Identity.VolumeSerialNumber
    fileId = $Identity.FileId
    size = $Identity.Size
    numberOfLinks = [int]$Identity.NumberOfLinks
    attributes = [long]$Identity.Attributes
    finalPath = $Identity.FinalPath
    sha256 = $Identity.Sha256
    fileSystem = $Identity.FileSystem
  }
}

function Assert-IdentityExpectation {
  param($Actual, [string]$Volume, [string]$FileId)
  if ($Actual.volumeSerialNumber -cne $Volume -or $Actual.fileId -cne $FileId) { Throw-G006BError 11 'owned identity mismatch' }
}

$moved = $false
$primary = $null
$cleanup = [Collections.Generic.List[string]]::new()
$leases = [Collections.Generic.List[IDisposable]]::new()
$lockLease = $null
$parentLease = $null
try {
  if ($Mode -ceq 'InspectFile') {
    $directory = $Kind -ceq 'directory'
    if ($Kind -and $Kind -cne 'file' -and $Kind -cne 'directory') { Throw-G006BError 10 'inspection kind rejected' }
    $canonical = Assert-CanonicalPath $Path $true $directory
    $parent = [IO.Path]::GetDirectoryName($canonical)
    Assert-PathChain $parent
    Assert-TrustedParentAcl $parent
    $lease = [G006BNativeFile]::OpenStableRead($canonical, $directory); $leases.Add($lease)
    $identity = Convert-Identity ([G006BNativeFile]::Inspect($lease)) 'inspected' $directory
    if ($identity.finalPath -cne $canonical) { Throw-G006BError 10 'handle final path mismatch' }
    ($identity | ConvertTo-Json -Compress)
    exit 0
  }

  if ($Mode -ceq 'FlushDirectory') {
    $canonical = Assert-CanonicalPath $Path $true $true
    Assert-PathChain $canonical
    Assert-TrustedParentAcl $canonical
    $lease = [G006BNativeFile]::OpenParent($canonical); $leases.Add($lease)
    $identity = [G006BNativeFile]::Inspect($lease)
    if ($identity.FileSystem -cne 'NTFS' -or $identity.FinalPath -cne $canonical) { Throw-G006BError 10 'directory handle identity rejected' }
    [G006BNativeFile]::Flush($lease)
    ([ordered]@{status='directory-flushed';path=$canonical;volumeSerialNumber=$identity.VolumeSerialNumber;fileId=$identity.FileId} | ConvertTo-Json -Compress)
    exit 0
  }

  if ($Mode -ceq 'LeaseDatabase') {
    $canonical = Assert-CanonicalPath $Path $true $false
    $canonicalLock = Assert-CanonicalPath $LockPath $false $false
    if ($canonicalLock -cne ($canonical + '.g006b.lock')) { Throw-G006BError 10 'database-specific lock path required' }
    $parent = [IO.Path]::GetDirectoryName($canonical)
    if ([IO.Path]::GetDirectoryName($canonicalLock) -cne $parent) { Throw-G006BError 10 'lock must be database sibling' }
    Assert-PathChain $parent; Assert-TrustedParentAcl $parent
    $parentLease = [G006BNativeFile]::OpenParent($parent); $leases.Add($parentLease)
    $databaseLease = [G006BNativeFile]::OpenDatabaseLease($canonical); $leases.Add($databaseLease)
    try { $lockLease = [G006BNativeFile]::CreateLock($canonicalLock); $leases.Add($lockLease) }
    catch { if ($_.Exception.Message -match 'error 80|error 183|exists') { Throw-G006BError 16 'database lock held' }; throw }
    [G006BNativeFile]::Flush($lockLease); [G006BNativeFile]::Flush($parentLease)
    $ready = Convert-Identity ([G006BNativeFile]::Inspect($databaseLease)) 'lease-ready'
    if ($ready.finalPath -cne $canonical) { Throw-G006BError 10 'database lease final path mismatch' }
    ($ready | ConvertTo-Json -Compress); [Console]::Out.Flush()
    $settledLease = $null
    while ($true) {
      $command = [Console]::In.ReadLine()
      if ($null -eq $command) { Throw-G006BError 15 'lease protocol EOF' }
      if ($command -ceq 'inspect') {
        $activeLease = if ($null -ne $settledLease) { $settledLease } else { $databaseLease }
        $current = Convert-Identity ([G006BNativeFile]::Inspect($activeLease)) 'lease-inspected'
        if ($current.finalPath -cne $canonical) { Throw-G006BError 11 'database lease path drift' }
        ($current | ConvertTo-Json -Compress); [Console]::Out.Flush(); continue
      }
      if ($command -ceq 'settle') {
        if ($null -ne $settledLease) { Throw-G006BError 15 'database already settled' }
        $settledLease = [G006BNativeFile]::OpenSettledRead($canonical); $leases.Add($settledLease)
        $settled = Convert-Identity ([G006BNativeFile]::Inspect($settledLease)) 'lease-settled'
        if ($settled.finalPath -cne $canonical -or $settled.fileId -cne $ready.fileId -or
            $settled.volumeSerialNumber -cne $ready.volumeSerialNumber) { Throw-G006BError 11 'settled database identity drift' }
        ($settled | ConvertTo-Json -Compress); [Console]::Out.Flush(); continue
      }
      if ($command -ceq 'release') {
        $activeLease = if ($null -ne $settledLease) { $settledLease } else { $databaseLease }
        $final = Convert-Identity ([G006BNativeFile]::Inspect($activeLease)) 'lease-released'
        [G006BNativeFile]::MarkDelete($lockLease); $lockLease.Dispose(); $leases.Remove($lockLease) | Out-Null
        $lockLease = $null
        [G006BNativeFile]::Flush($parentLease)
        ($final | ConvertTo-Json -Compress); [Console]::Out.Flush(); exit 0
      }
      Throw-G006BError 15 'unknown lease protocol command'
    }
  }

  if ($Mode -ceq 'CleanupOwned') {
    if ($Kind -cne 'file' -and $Kind -cne 'directory') { Throw-G006BError 10 'cleanup kind rejected' }
    $directory = $Kind -ceq 'directory'
    $canonical = Assert-CanonicalPath $Path $true $directory
    $parent = [IO.Path]::GetDirectoryName($canonical)
    Assert-PathChain $parent; Assert-TrustedParentAcl $parent
    $parentLease = [G006BNativeFile]::OpenParent($parent); $leases.Add($parentLease)
    $owned = [G006BNativeFile]::OpenOwnedForDelete($canonical, $directory); $leases.Add($owned)
    $identity = Convert-Identity ([G006BNativeFile]::Inspect($owned)) 'cleanup-owned' $directory
    Assert-IdentityExpectation $identity $ExpectedVolumeSerialNumber $ExpectedFileId
    [G006BNativeFile]::MarkDelete($owned); $owned.Dispose(); $leases.Remove($owned) | Out-Null
    [G006BNativeFile]::Flush($parentLease)
    ([ordered]@{status='cleaned-owned';path=$canonical;volumeSerialNumber=$identity.volumeSerialNumber;fileId=$identity.fileId} | ConvertTo-Json -Compress)
    exit 0
  }

  if ($Mode -ceq 'CleanupOwnedTree') {
    $canonical = Assert-CanonicalPath $Path $true $true
    $parent = [IO.Path]::GetDirectoryName($canonical)
    Assert-PathChain $parent; Assert-TrustedParentAcl $parent
    $parentLease = [G006BNativeFile]::OpenParent($parent); $leases.Add($parentLease)
    $ownedDirectory = [G006BNativeFile]::OpenOwnedForDelete($canonical, $true); $leases.Add($ownedDirectory)
    $directoryIdentity = Convert-Identity ([G006BNativeFile]::Inspect($ownedDirectory)) 'cleanup-owned-tree' $true
    Assert-IdentityExpectation $directoryIdentity $ExpectedVolumeSerialNumber $ExpectedFileId
    foreach ($item in Get-ChildItem -LiteralPath $canonical -Force) {
      if ($item.PSIsContainer -or [IO.Path]::GetDirectoryName($item.FullName) -cne $canonical) { Throw-G006BError 11 'owned tree child rejected' }
      $child = [G006BNativeFile]::OpenOwnedForDelete($item.FullName, $false); $leases.Add($child)
      $childIdentity = Convert-Identity ([G006BNativeFile]::Inspect($child)) 'cleanup-owned-tree-child'
      if ([IO.Path]::GetDirectoryName($childIdentity.finalPath) -cne $canonical) { Throw-G006BError 11 'owned tree child final path escaped' }
      [G006BNativeFile]::MarkDelete($child); $child.Dispose(); $leases.Remove($child) | Out-Null
    }
    [G006BNativeFile]::MarkDelete($ownedDirectory); $ownedDirectory.Dispose(); $leases.Remove($ownedDirectory) | Out-Null
    [G006BNativeFile]::Flush($parentLease)
    ([ordered]@{status='cleaned-owned-tree';path=$canonical;volumeSerialNumber=$directoryIdentity.volumeSerialNumber;fileId=$directoryIdentity.fileId} | ConvertTo-Json -Compress)
    exit 0
  }

  if ($ExpectedSha256 -cnotmatch '^[0-9a-f]{64}$' -or $ExpectedBytes -lt 0) { Throw-G006BError 10 'expected hash/bytes required' }
  $source = Assert-CanonicalPath $SourcePath $true $false
  $destination = Assert-CanonicalPath $DestinationPath $false $false
  $parent = [IO.Path]::GetDirectoryName($source)
  if ([IO.Path]::GetDirectoryName($destination) -cne $parent -or
      -not [IO.Path]::GetFileName($source).StartsWith([IO.Path]::GetFileName($destination) + '.g006b.tmp.', [StringComparison]::Ordinal)) {
    Throw-G006BError 10 'destination-bound sibling temporary required'
  }
  Assert-PathChain $parent; Assert-TrustedParentAcl $parent
  $parentLease = [G006BNativeFile]::OpenParent($parent); $leases.Add($parentLease)
  $sourceLease = [G006BNativeFile]::OpenPublisherSource($source); $leases.Add($sourceLease)
  $sourceIdentity = Convert-Identity ([G006BNativeFile]::Inspect($sourceLease)) 'source'
  if ($sourceIdentity.finalPath -cne $source -or $sourceIdentity.sha256 -cne $ExpectedSha256 -or $sourceIdentity.size -ne $ExpectedBytes) { Throw-G006BError 11 'source identity/bytes mismatch' }

  $existing = $null
  if (Test-Path -LiteralPath $destination) {
    $existingLease = [G006BNativeFile]::OpenStableRead($destination, $false); $leases.Add($existingLease)
    $existing = Convert-Identity ([G006BNativeFile]::Inspect($existingLease)) 'existing'
    if ($existing.finalPath -cne $destination -or $existing.sha256 -cne $ExpectedSha256 -or $existing.size -ne $ExpectedBytes) { Throw-G006BError 11 'existing destination differs' }
    [G006BNativeFile]::MarkDelete($sourceLease); $sourceLease.Dispose(); $leases.Remove($sourceLease) | Out-Null
    [G006BNativeFile]::Flush($parentLease)
    ($existing | ConvertTo-Json -Compress); exit 0
  }

  [G006BNativeFile]::Flush($sourceLease)
  $sourceLease.Dispose(); $leases.Remove($sourceLease) | Out-Null
  $sourceLease = [G006BNativeFile]::OpenStableRead($source, $false); $leases.Add($sourceLease)
  $stableSource = Convert-Identity ([G006BNativeFile]::Inspect($sourceLease)) 'stable-source'
  if ($stableSource.fileId -cne $sourceIdentity.fileId -or $stableSource.volumeSerialNumber -cne $sourceIdentity.volumeSerialNumber -or
      $stableSource.sha256 -cne $ExpectedSha256 -or $stableSource.size -ne $ExpectedBytes) { Throw-G006BError 11 'source changed before move' }
  $moveError = [G006BNativeFile]::MoveNoReplaceWriteThrough($source, $destination)
  if ($moveError -eq 0) { $moved = $true }
  elseif ($moveError -eq 80 -or $moveError -eq 183) {
    $raceLease = [G006BNativeFile]::OpenStableRead($destination, $false); $leases.Add($raceLease)
    $race = Convert-Identity ([G006BNativeFile]::Inspect($raceLease)) 'existing-race'
    if ($race.finalPath -cne $destination -or $race.sha256 -cne $ExpectedSha256 -or $race.size -ne $ExpectedBytes) { Throw-G006BError 13 'destination race differs' }
    [G006BNativeFile]::MarkDelete($sourceLease); $sourceLease.Dispose(); $leases.Remove($sourceLease) | Out-Null
    [G006BNativeFile]::Flush($parentLease)
    ($race | ConvertTo-Json -Compress); exit 0
  } else { Throw-G006BError 13 ('MoveFileExW failed error ' + $moveError) }

  $retained = Convert-Identity ([G006BNativeFile]::Inspect($sourceLease)) 'retained-published'
  if ($retained.finalPath -cne $destination -or $retained.fileId -cne $sourceIdentity.fileId -or $retained.volumeSerialNumber -cne $sourceIdentity.volumeSerialNumber) { Throw-G006BError 14 'retained published identity drift' }
  [G006BNativeFile]::Flush($parentLease)
  Assert-PathChain $parent
  $reopen = [G006BNativeFile]::OpenStableRead($destination, $false); $leases.Add($reopen)
  $published = Convert-Identity ([G006BNativeFile]::Inspect($reopen)) 'published'
  if ($published.finalPath -cne $destination -or $published.fileId -cne $sourceIdentity.fileId -or
      $published.volumeSerialNumber -cne $sourceIdentity.volumeSerialNumber -or
      $published.sha256 -cne $ExpectedSha256 -or $published.size -ne $ExpectedBytes) { Throw-G006BError 14 'published reopen verification failed' }
  ($published | ConvertTo-Json -Compress)
  exit 0
} catch {
  $primary = $_.Exception
} finally {
  if ($Mode -ceq 'LeaseDatabase' -and $null -ne $lockLease) {
    try {
      [G006BNativeFile]::MarkDelete($lockLease); $lockLease.Dispose(); $leases.Remove($lockLease) | Out-Null
      if ($null -ne $parentLease) { [G006BNativeFile]::Flush($parentLease) }
    } catch { $cleanup.Add('lease lock cleanup: ' + $_.Exception.Message) }
  }
  for ($index = $leases.Count - 1; $index -ge 0; $index--) {
    try { $leases[$index].Dispose() } catch { $cleanup.Add($_.Exception.Message) }
  }
}

$exitCode = if ($moved) { 14 } elseif ($null -ne $primary -and $primary.Data.Contains('G006BExitCode')) { [int]$primary.Data['G006BExitCode'] } else { 15 }
$prefix = if ($moved) { 'G006B_PUBLISHED_UNVERIFIED_RECOVERY_REQUIRED: ' } else { '' }
$details = if ($cleanup.Count -gt 0) { ' cleanup=[' + ($cleanup -join ' | ') + ']' } else { '' }
[Console]::Error.WriteLine($prefix + $primary.Message + $details)
exit $exitCode
