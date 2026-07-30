[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("InspectFile", "FlushDirectory", "LeaseDatabase", "CleanupOwned")]
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
    internal readonly bool MetadataOnly;

    internal G006BNativeLease(SafeFileHandle handle, bool directory, string openedPath, bool metadataOnly = false)
    {
        Handle = handle;
        Directory = directory;
        OpenedPath = openedPath;
        MetadataOnly = metadataOnly;
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
    private const uint FILE_ATTRIBUTE_DIRECTORY = 0x00000010;
    private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
    private const uint FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;
    private const uint SYNCHRONIZE = 0x00100000;
    private const uint OBJ_CASE_INSENSITIVE = 0x00000040;
    private const uint FILE_CREATE = 2;
    private const uint FILE_DIRECTORY_FILE = 0x00000001;
    private const uint FILE_SYNCHRONOUS_IO_NONALERT = 0x00000020;
    private const uint FILE_OPEN_REPARSE_POINT = 0x00200000;
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

    [StructLayout(LayoutKind.Sequential)]
    private struct UNICODE_STRING
    {
        public ushort Length;
        public ushort MaximumLength;
        public IntPtr Buffer;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct OBJECT_ATTRIBUTES
    {
        public int Length;
        public IntPtr RootDirectory;
        public IntPtr ObjectName;
        public uint Attributes;
        public IntPtr SecurityDescriptor;
        public IntPtr SecurityQualityOfService;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_STATUS_BLOCK
    {
        public IntPtr Status;
        public IntPtr Information;
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

    [DllImport("ntdll.dll")]
    private static extern int NtCreateFile(
        out IntPtr fileHandle, uint desiredAccess, ref OBJECT_ATTRIBUTES objectAttributes,
        out IO_STATUS_BLOCK ioStatusBlock, IntPtr allocationSize, uint fileAttributes,
        uint shareAccess, uint createDisposition, uint createOptions, IntPtr eaBuffer, uint eaLength);

    [DllImport("ntdll.dll")]
    private static extern uint RtlNtStatusToDosError(int status);

    [DllImport("ntdll.dll")]
    private static extern int NtSetInformationFile(
        SafeFileHandle fileHandle, out IO_STATUS_BLOCK ioStatusBlock,
        IntPtr fileInformation, uint length, int fileInformationClass);

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

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WriteFile(
        SafeFileHandle file, byte[] buffer, uint bytesToWrite, out uint bytesWritten, IntPtr overlapped);

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
        string path, uint access, uint share, bool directory, uint disposition, bool metadataOnly = false)
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
        return new G006BNativeLease(handle, directory, path, metadataOnly);
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

    public static G006BNativeLease OpenSidecarLease(string path)
    {
        return Open(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, false, OPEN_EXISTING, true);
    }

    public static G006BNativeLease OpenParent(string path)
    {
        return Open(path, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, true, OPEN_EXISTING);
    }

    public static G006BNativeLease CreateLock(string path)
    {
        return Open(path, GENERIC_READ | GENERIC_WRITE | DELETE, 0, false, CREATE_NEW);
    }

    public static G006BNativeLease CreateOwnedFile(string path)
    {
        return Open(path, GENERIC_READ | GENERIC_WRITE | DELETE, FILE_SHARE_READ, false, CREATE_NEW);
    }

    public static G006BNativeLease RetainExistingDirectory(string path)
    {
        return Open(path, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, true, OPEN_EXISTING);
    }

    public static G006BNativeLease CreateOwnedDirectory(G006BNativeLease parent, string path)
    {
        string leaf = Path.GetFileName(path);
        if (String.IsNullOrWhiteSpace(leaf) || leaf.IndexOfAny(new char[] { '\\', '/', '\0' }) >= 0)
            throw new InvalidOperationException("owned directory leaf rejected");
        IntPtr nameBuffer = Marshal.StringToHGlobalUni(leaf);
        IntPtr unicodeBuffer = IntPtr.Zero;
        IntPtr rawHandle = IntPtr.Zero;
        try
        {
            int byteLength = Encoding.Unicode.GetByteCount(leaf);
            UNICODE_STRING unicode = new UNICODE_STRING {
                Length = checked((ushort)byteLength),
                MaximumLength = checked((ushort)(byteLength + 2)),
                Buffer = nameBuffer
            };
            unicodeBuffer = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(UNICODE_STRING)));
            Marshal.StructureToPtr(unicode, unicodeBuffer, false);
            OBJECT_ATTRIBUTES attributes = new OBJECT_ATTRIBUTES {
                Length = Marshal.SizeOf(typeof(OBJECT_ATTRIBUTES)),
                RootDirectory = parent.Handle.DangerousGetHandle(),
                ObjectName = unicodeBuffer,
                Attributes = OBJ_CASE_INSENSITIVE,
                SecurityDescriptor = IntPtr.Zero,
                SecurityQualityOfService = IntPtr.Zero
            };
            IO_STATUS_BLOCK ioStatus;
            int status = NtCreateFile(
                out rawHandle, GENERIC_READ | GENERIC_WRITE | DELETE | SYNCHRONIZE,
                ref attributes, out ioStatus, IntPtr.Zero, FILE_ATTRIBUTE_DIRECTORY,
                FILE_SHARE_READ | FILE_SHARE_WRITE, FILE_CREATE,
                FILE_DIRECTORY_FILE | FILE_SYNCHRONOUS_IO_NONALERT | FILE_OPEN_REPARSE_POINT,
                IntPtr.Zero, 0);
            if (status < 0)
            {
                int error = unchecked((int)RtlNtStatusToDosError(status));
                throw new Win32Exception(error, "NtCreateFile directory failed error " + error + " for " + path);
            }
            SafeFileHandle handle = new SafeFileHandle(rawHandle, true);
            rawHandle = IntPtr.Zero;
            return new G006BNativeLease(handle, true, path);
        }
        finally
        {
            if (rawHandle != IntPtr.Zero) new SafeFileHandle(rawHandle, true).Dispose();
            if (unicodeBuffer != IntPtr.Zero) Marshal.FreeHGlobal(unicodeBuffer);
            Marshal.FreeHGlobal(nameBuffer);
        }
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
        string finalPath = FinalPath(lease.Handle);
        AssertNotCloudSyncRoot(finalPath);
        return new G006BNativeIdentity {
            VolumeSerialNumber = identity.VolumeSerialNumber.ToString(),
            FileId = id.ToString(),
            Size = standard.EndOfFile,
            NumberOfLinks = standard.NumberOfLinks,
            Attributes = basic.FileAttributes,
            FinalPath = finalPath,
            Sha256 = lease.Directory || lease.MetadataOnly ? null : Hash(lease.Handle),
            FileSystem = FileSystemFor(finalPath)
        };
    }

    public static void Write(G006BNativeLease lease, long offset, byte[] bytes)
    {
        if (lease.Directory || offset < 0 || bytes == null || bytes.Length > 65536)
            throw new InvalidOperationException("retained write contract rejected");
        long position;
        if (!SetFilePointerEx(lease.Handle, offset, out position, 0) || position != offset)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "retained write seek failed");
        uint written;
        if (!WriteFile(lease.Handle, bytes, (uint)bytes.Length, out written, IntPtr.Zero) || written != bytes.Length)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "retained write failed");
    }

    public static void Flush(G006BNativeLease lease)
    {
        if (!FlushFileBuffers(lease.Handle))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "FlushFileBuffers failed");
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

    public static void RenameNoReplace(G006BNativeLease source, G006BNativeLease destinationParent, string destinationPath)
    {
        if (String.IsNullOrWhiteSpace(destinationPath) || !Path.IsPathRooted(destinationPath) || destinationPath.IndexOf('\0') >= 0)
            throw new InvalidOperationException("absolute destination path rejected");
        string destinationName = Path.GetFileName(destinationPath);
        if (String.IsNullOrWhiteSpace(destinationName) || destinationName.IndexOfAny(new char[] { '\\', '/', '\0' }) >= 0)
            throw new InvalidOperationException("destination leaf name rejected");
        byte[] name = Encoding.Unicode.GetBytes(destinationName);
        int rootOffset = IntPtr.Size == 8 ? 8 : 4;
        int lengthOffset = rootOffset + IntPtr.Size;
        int nameOffset = lengthOffset + 4;
        IntPtr buffer = Marshal.AllocHGlobal(nameOffset + name.Length);
        try
        {
            for (int index = 0; index < nameOffset + name.Length; index++) Marshal.WriteByte(buffer, index, 0);
            Marshal.WriteByte(buffer, 0, 0);
            Marshal.WriteIntPtr(buffer, rootOffset, destinationParent.Handle.DangerousGetHandle());
            Marshal.WriteInt32(buffer, lengthOffset, name.Length);
            Marshal.Copy(name, 0, IntPtr.Add(buffer, nameOffset), name.Length);
            IO_STATUS_BLOCK ioStatus;
            int status = NtSetInformationFile(source.Handle, out ioStatus, buffer, (uint)(nameOffset + name.Length), 10);
            if (status < 0)
            {
                int error = unchecked((int)RtlNtStatusToDosError(status));
                throw new Win32Exception(error, "identity-retained rename failed error " + error + " for " + destinationPath);
            }
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
$publicationReady = $false
$primary = $null
$cleanup = [Collections.Generic.List[string]]::new()
$leases = [Collections.Generic.List[IDisposable]]::new()
$lockLease = $null
$parentLease = $null
try {
  if ($Mode -ceq 'InspectFile') {
    $directory = $Kind -ceq 'directory'
    $sidecar = $Kind -ceq 'sidecar'
    if ($Kind -and $Kind -cne 'file' -and $Kind -cne 'directory' -and $Kind -cne 'sidecar') { Throw-G006BError 10 'inspection kind rejected' }
    $canonical = Assert-CanonicalPath $Path $true $directory
    $parent = [IO.Path]::GetDirectoryName($canonical)
    Assert-PathChain $parent
    Assert-TrustedParentAcl $parent
    $lease = if ($sidecar) { [G006BNativeFile]::OpenSidecarLease($canonical) } else { [G006BNativeFile]::OpenStableRead($canonical, $directory) }; $leases.Add($lease)
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
    $lockIdentity = Convert-Identity ([G006BNativeFile]::Inspect($lockLease)) 'lock-ready'
    if ($ready.finalPath -cne $canonical) { Throw-G006BError 10 'database lease final path mismatch' }
    $ready['lockVolumeSerialNumber'] = $lockIdentity.volumeSerialNumber
    $ready['lockFileId'] = $lockIdentity.fileId
    ($ready | ConvertTo-Json -Compress); [Console]::Out.Flush()
    $settledLease = $null
    $ownedResources = @{}
    $resourceOrder = 0
    $publication = $null
    $sidecars = $null
    while ($true) {
      $command = [Console]::In.ReadLine()
      if ($null -eq $command) { Throw-G006BError 15 'lease protocol EOF' }
      if ($null -ne $publication) {
        if ($command -ceq 'publication-inspect') {
          $current = Convert-Identity ([G006BNativeFile]::Inspect($publication.Lease)) 'publication-inspected'
          if ($current.finalPath -cne $publication.Destination -or $current.fileId -cne $publication.Identity.fileId -or
              $current.volumeSerialNumber -cne $publication.Identity.volumeSerialNumber -or
              $current.sha256 -cne $publication.Sha256 -or $current.size -ne $publication.Bytes) { Throw-G006BError 14 'retained publication challenge drift' }
          ($current | ConvertTo-Json -Compress); [Console]::Out.Flush(); continue
        }
        if ($command -ceq 'publication-release') {
          $released = Convert-Identity ([G006BNativeFile]::Inspect($publication.Lease)) 'publication-released'
          $publication.Lease.Dispose(); $leases.Remove($publication.Lease) | Out-Null
          $publication = $null
          ($released | ConvertTo-Json -Compress); [Console]::Out.Flush(); continue
        }
        Throw-G006BError 14 'publication challenge/release required'
      }
      if ($command.StartsWith('resource-create-file' + "`t", [StringComparison]::Ordinal) -or
          $command.StartsWith('resource-create-directory' + "`t", [StringComparison]::Ordinal)) {
        $parts = $command -split "`t", 3
        if ($parts.Count -lt 2) { Throw-G006BError 12 'owned resource protocol shape' }
        $directory = $parts[0] -ceq 'resource-create-directory'
        $resourcePath = Assert-CanonicalPath $parts[1] $false $directory
        $disposition = if ($parts.Count -eq 3) { $parts[2] } else { 'cleanup' }
        if ($disposition -cne 'cleanup' -and $disposition -cne 'release') { Throw-G006BError 12 'owned resource disposition rejected' }
        if ($ownedResources.ContainsKey($resourcePath) -or (Test-Path -LiteralPath $resourcePath)) { Throw-G006BError 12 'owned resource already exists' }
        $resourceParentPath = [IO.Path]::GetDirectoryName($resourcePath)
        Assert-PathChain $resourceParentPath; Assert-TrustedParentAcl $resourceParentPath
        if ($ownedResources.ContainsKey($resourceParentPath) -and $ownedResources[$resourceParentPath].Directory) {
          $resourceParentLease = $ownedResources[$resourceParentPath].Lease
        } else {
          $resourceParentLease = [G006BNativeFile]::OpenParent($resourceParentPath); $leases.Add($resourceParentLease)
        }
        $resourceLease = if ($directory) { [G006BNativeFile]::CreateOwnedDirectory($resourceParentLease, $resourcePath) } else { [G006BNativeFile]::CreateOwnedFile($resourcePath) }
        $leases.Add($resourceLease)
        $resourceIdentity = Convert-Identity ([G006BNativeFile]::Inspect($resourceLease)) 'resource-created' $directory
        if ($resourceIdentity.finalPath -cne $resourcePath) { Throw-G006BError 11 'created resource final path mismatch' }
        [G006BNativeFile]::Flush($resourceParentLease)
        $resourceOrder += 1
        $ownedResources[$resourcePath] = [pscustomobject]@{Lease=$resourceLease;Parent=$resourceParentLease;Directory=$directory;Identity=$resourceIdentity;Disposition=$disposition;Order=$resourceOrder;Written=[long]0;Owned=$true}
        ($resourceIdentity | ConvertTo-Json -Compress); [Console]::Out.Flush(); continue
      }
      if ($command.StartsWith('resource-retain-directory' + "`t", [StringComparison]::Ordinal)) {
        $parts = $command -split "`t", 2
        $resourcePath = Assert-CanonicalPath $parts[1] $true $true
        if ($ownedResources.ContainsKey($resourcePath)) { Throw-G006BError 12 'retained directory already registered' }
        $resourceParentPath = [IO.Path]::GetDirectoryName($resourcePath)
        Assert-PathChain $resourcePath; Assert-TrustedParentAcl $resourceParentPath
        $resourceParentLease = [G006BNativeFile]::OpenParent($resourceParentPath); $leases.Add($resourceParentLease)
        $resourceLease = [G006BNativeFile]::RetainExistingDirectory($resourcePath); $leases.Add($resourceLease)
        $resourceIdentity = Convert-Identity ([G006BNativeFile]::Inspect($resourceLease)) 'resource-created' $true
        if ($resourceIdentity.finalPath -cne $resourcePath) { Throw-G006BError 11 'retained directory final path mismatch' }
        $resourceOrder += 1
        $ownedResources[$resourcePath] = [pscustomobject]@{Lease=$resourceLease;Parent=$resourceParentLease;Directory=$true;Identity=$resourceIdentity;Disposition='release';Order=$resourceOrder;Written=[long]0;Owned=$false}
        ($resourceIdentity | ConvertTo-Json -Compress); [Console]::Out.Flush(); continue
      }
      if ($command.StartsWith('resource-inspect' + "`t", [StringComparison]::Ordinal)) {
        $parts = $command -split "`t", 2; $resourcePath = $parts[1]
        if (-not $ownedResources.ContainsKey($resourcePath)) { Throw-G006BError 11 'resource is not broker-owned' }
        $resource = $ownedResources[$resourcePath]
        $current = Convert-Identity ([G006BNativeFile]::Inspect($resource.Lease)) 'resource-inspected' $resource.Directory
        Assert-IdentityExpectation $current $resource.Identity.volumeSerialNumber $resource.Identity.fileId
        ($current | ConvertTo-Json -Compress); [Console]::Out.Flush(); continue
      }
      if ($command.StartsWith('resource-write' + "`t", [StringComparison]::Ordinal)) {
        $parts = $command -split "`t", 4
        if ($parts.Count -ne 4) { Throw-G006BError 12 'resource write protocol shape' }
        $resourcePath = $parts[1]
        if (-not $ownedResources.ContainsKey($resourcePath)) { Throw-G006BError 11 'resource is not broker-owned' }
        $resource = $ownedResources[$resourcePath]
        if ($resource.Directory -or -not $resource.Owned) { Throw-G006BError 12 'resource is not a writable owned file' }
        $offset = [long]$parts[2]
        if ($offset -ne $resource.Written) { Throw-G006BError 12 'resource write offset rejected' }
        try { $chunk = [Convert]::FromBase64String($parts[3]) } catch { Throw-G006BError 12 'resource write base64 rejected' }
        if ($chunk.Length -gt 65536) { Throw-G006BError 12 'resource write chunk too large' }
        [G006BNativeFile]::Write($resource.Lease, $offset, $chunk)
        $resource.Written += $chunk.Length
        ([ordered]@{status='resource-written';path=$resourcePath;bytes=$resource.Written} | ConvertTo-Json -Compress); [Console]::Out.Flush(); continue
      }
      if ($command.StartsWith('resource-write-complete' + "`t", [StringComparison]::Ordinal)) {
        $parts = $command -split "`t", 4
        if ($parts.Count -ne 4) { Throw-G006BError 12 'resource write completion shape' }
        $resourcePath = $parts[1]
        if (-not $ownedResources.ContainsKey($resourcePath)) { Throw-G006BError 11 'resource is not broker-owned' }
        $resource = $ownedResources[$resourcePath]
        $expectedBytes = [long]$parts[2]; $expectedSha = $parts[3]
        if ($resource.Directory -or $expectedBytes -ne $resource.Written -or $expectedSha -cnotmatch '^[0-9a-f]{64}$') { Throw-G006BError 12 'resource write completion rejected' }
        [G006BNativeFile]::Flush($resource.Lease)
        $current = Convert-Identity ([G006BNativeFile]::Inspect($resource.Lease)) 'resource-written'
        Assert-IdentityExpectation $current $resource.Identity.volumeSerialNumber $resource.Identity.fileId
        if ($current.size -ne $expectedBytes -or $current.sha256 -cne $expectedSha -or $current.finalPath -cne $resourcePath) { Throw-G006BError 12 'resource write verification failed' }
        ($current | ConvertTo-Json -Compress); [Console]::Out.Flush(); continue
      }
      if ($command.StartsWith('resource-flush' + "`t", [StringComparison]::Ordinal)) {
        $parts = $command -split "`t", 2; $resourcePath = $parts[1]
        if (-not $ownedResources.ContainsKey($resourcePath)) { Throw-G006BError 11 'resource is not broker-owned' }
        $resource = $ownedResources[$resourcePath]
        [G006BNativeFile]::Flush($resource.Lease); [G006BNativeFile]::Flush($resource.Parent)
        $current = Convert-Identity ([G006BNativeFile]::Inspect($resource.Lease)) 'resource-flushed' $resource.Directory
        Assert-IdentityExpectation $current $resource.Identity.volumeSerialNumber $resource.Identity.fileId
        ($current | ConvertTo-Json -Compress); [Console]::Out.Flush(); continue
      }
      if ($command.StartsWith('resource-cleanup' + "`t", [StringComparison]::Ordinal)) {
        $parts = $command -split "`t", 2; $resourcePath = $parts[1]
        if (-not $ownedResources.ContainsKey($resourcePath)) { Throw-G006BError 11 'resource is not broker-owned' }
        $resource = $ownedResources[$resourcePath]
        if ($resource.Disposition -cne 'cleanup' -or -not $resource.Owned) { Throw-G006BError 11 'resource is not cleanup-owned' }
        $current = Convert-Identity ([G006BNativeFile]::Inspect($resource.Lease)) 'resource-cleanup' $resource.Directory
        Assert-IdentityExpectation $current $resource.Identity.volumeSerialNumber $resource.Identity.fileId
        [G006BNativeFile]::MarkDelete($resource.Lease); $resource.Lease.Dispose(); $leases.Remove($resource.Lease) | Out-Null
        [G006BNativeFile]::Flush($resource.Parent)
        $ownedResources.Remove($resourcePath)
        ($current | ConvertTo-Json -Compress); [Console]::Out.Flush(); continue
      }
      if ($command.StartsWith('resource-release' + "`t", [StringComparison]::Ordinal)) {
        $parts = $command -split "`t", 2; $resourcePath = $parts[1]
        if (-not $ownedResources.ContainsKey($resourcePath)) { Throw-G006BError 11 'resource is not broker-owned' }
        $resource = $ownedResources[$resourcePath]
        if ($resource.Disposition -cne 'release') { Throw-G006BError 11 'resource is not release-owned' }
        $current = Convert-Identity ([G006BNativeFile]::Inspect($resource.Lease)) 'resource-released' $resource.Directory
        Assert-IdentityExpectation $current $resource.Identity.volumeSerialNumber $resource.Identity.fileId
        $resource.Lease.Dispose(); $leases.Remove($resource.Lease) | Out-Null
        [G006BNativeFile]::Flush($resource.Parent)
        $ownedResources.Remove($resourcePath)
        ($current | ConvertTo-Json -Compress); [Console]::Out.Flush(); continue
      }
      if ($command.StartsWith('resource-publish' + "`t", [StringComparison]::Ordinal)) {
        $parts = $command -split "`t", 5
        if ($parts.Count -ne 5) { Throw-G006BError 13 'resource publish protocol shape' }
        $resourcePath = $parts[1]; $destination = Assert-CanonicalPath $parts[2] $false $false
        $resourceSha = $parts[3]; $resourceBytes = [long]$parts[4]
        if ($resourceSha -cnotmatch '^[0-9a-f]{64}$' -or $resourceBytes -lt 0 -or -not $ownedResources.ContainsKey($resourcePath)) { Throw-G006BError 13 'resource publish authority rejected' }
        $resource = $ownedResources[$resourcePath]
        if ($resource.Directory -or [IO.Path]::GetDirectoryName($destination) -cne [IO.Path]::GetDirectoryName($resourcePath) -or
            -not [IO.Path]::GetFileName($resourcePath).StartsWith([IO.Path]::GetFileName($destination) + '.g006b.tmp.', [StringComparison]::Ordinal)) { Throw-G006BError 13 'resource publish sibling binding rejected' }
        $publisherLease = $resource.Lease
        $sourceIdentity = Convert-Identity ([G006BNativeFile]::Inspect($publisherLease)) 'resource-publish-source'
        Assert-IdentityExpectation $sourceIdentity $resource.Identity.volumeSerialNumber $resource.Identity.fileId
        if ($sourceIdentity.sha256 -cne $resourceSha -or $sourceIdentity.size -ne $resourceBytes) { Throw-G006BError 13 'resource publish bytes drift' }
        [G006BNativeFile]::Flush($publisherLease)
        $destinationLease = $null
        if (Test-Path -LiteralPath $destination) {
          $destinationLease = [G006BNativeFile]::OpenSettledRead($destination); $leases.Add($destinationLease)
          $published = Convert-Identity ([G006BNativeFile]::Inspect($destinationLease)) 'publication-ready'
          if ($published.sha256 -cne $resourceSha -or $published.size -ne $resourceBytes -or $published.finalPath -cne $destination) { Throw-G006BError 13 'existing destination differs' }
          [G006BNativeFile]::MarkDelete($publisherLease); $publisherLease.Dispose(); $leases.Remove($publisherLease) | Out-Null
          $ownedResources.Remove($resourcePath)
        } else {
          try {
            [G006BNativeFile]::RenameNoReplace($publisherLease, $resource.Parent, $destination)
            $moved = $true
            $ownedResources.Remove($resourcePath)
            $retainedMoved = Convert-Identity ([G006BNativeFile]::Inspect($publisherLease)) 'publication-moved'
            $publisherLease.Dispose(); $leases.Remove($publisherLease) | Out-Null
            $destinationLease = [G006BNativeFile]::OpenSettledRead($destination); $leases.Add($destinationLease)
            $published = Convert-Identity ([G006BNativeFile]::Inspect($destinationLease)) 'publication-ready'
            if ($published.fileId -cne $retainedMoved.fileId -or $published.volumeSerialNumber -cne $retainedMoved.volumeSerialNumber) { Throw-G006BError 14 'published resource replaced before settled lease' }
          } catch {
            if ($_.Exception.Message -notmatch 'error 80|error 183') { throw }
            $destinationLease = [G006BNativeFile]::OpenSettledRead($destination); $leases.Add($destinationLease)
            $published = Convert-Identity ([G006BNativeFile]::Inspect($destinationLease)) 'publication-ready'
            if ($published.sha256 -cne $resourceSha -or $published.size -ne $resourceBytes -or $published.finalPath -cne $destination) { Throw-G006BError 13 'raced destination differs' }
            [G006BNativeFile]::MarkDelete($publisherLease); $publisherLease.Dispose(); $leases.Remove($publisherLease) | Out-Null
            $ownedResources.Remove($resourcePath)
          }
        }
        [G006BNativeFile]::Flush($resource.Parent)
        if ($published.sha256 -cne $resourceSha -or $published.size -ne $resourceBytes -or $published.finalPath -cne $destination) { Throw-G006BError 14 'published resource verification failed' }
        $ownedResources.Remove($resourcePath)
        $publicationReady = $true
        $publication = [pscustomobject]@{Lease=$destinationLease;Destination=$destination;Identity=$published;Sha256=$resourceSha;Bytes=$resourceBytes}
        ($published | ConvertTo-Json -Compress); [Console]::Out.Flush(); continue
      }
      if ($command.StartsWith('sidecars-capture' + "`t", [StringComparison]::Ordinal)) {
        if ($null -ne $sidecars) { Throw-G006BError 15 'sidecars already captured' }
        $parts = $command -split "`t", 3
        if ($parts.Count -ne 3) { Throw-G006BError 15 'sidecar capture shape' }
        $sidecars = [ordered]@{}
        foreach ($entry in @(@{Name='wal';Path=$parts[1]},@{Name='shm';Path=$parts[2]})) {
          $sidecarPath = Assert-CanonicalPath $entry.Path $false $false
          $record = [pscustomobject]@{Path=$sidecarPath;Lease=$null;Identity=$null}
          if (Test-Path -LiteralPath $sidecarPath) {
            $record.Lease = [G006BNativeFile]::OpenSidecarLease($sidecarPath); $leases.Add($record.Lease)
            $record.Identity = Convert-Identity ([G006BNativeFile]::Inspect($record.Lease)) 'sidecar-captured'
            if ($record.Identity.finalPath -cne $sidecarPath) { Throw-G006BError 11 'sidecar final path mismatch' }
            if ($entry.Name -ceq 'wal' -and $record.Identity.size -ne 0) { Throw-G006BError 17 'nonzero WAL retained at settled boundary' }
          }
          $sidecars[$entry.Name] = $record
        }
        ([ordered]@{status='sidecars-captured';wal=$sidecars.wal.Identity;shm=$sidecars.shm.Identity} | ConvertTo-Json -Compress -Depth 4); [Console]::Out.Flush(); continue
      }
      if ($command -ceq 'sidecars-inspect' -or $command -ceq 'sidecars-release') {
        if ($null -eq $sidecars) { Throw-G006BError 15 'sidecars are not captured' }
        foreach ($name in @('wal','shm')) {
          $record = $sidecars[$name]
          if ($null -eq $record.Lease -and (Test-Path -LiteralPath $record.Path)) {
            $record.Lease = [G006BNativeFile]::OpenSidecarLease($record.Path); $leases.Add($record.Lease)
            $record.Identity = Convert-Identity ([G006BNativeFile]::Inspect($record.Lease)) 'sidecar-captured'
          }
          if ($null -ne $record.Lease) {
            if (-not (Test-Path -LiteralPath $record.Path)) { Throw-G006BError 17 ($name + ' sidecar disappeared') }
            $current = Convert-Identity ([G006BNativeFile]::Inspect($record.Lease)) 'sidecar-inspected'
            if ($current.finalPath -cne $record.Path -or $current.volumeSerialNumber -cne $record.Identity.volumeSerialNumber -or
                $current.fileId -cne $record.Identity.fileId -or $current.size -gt $record.Identity.size) { Throw-G006BError 17 ($name + ' sidecar identity/growth drift') }
            if ($name -ceq 'wal' -and $current.size -ne 0) { Throw-G006BError 17 'nonzero WAL retained at verification boundary' }
            $record.Identity = $current
          }
        }
        $status = if ($command -ceq 'sidecars-release') { 'sidecars-released' } else { 'sidecars-inspected' }
        $response = [ordered]@{status=$status;wal=$sidecars.wal.Identity;shm=$sidecars.shm.Identity}
        if ($command -ceq 'sidecars-release') {
          foreach ($name in @('wal','shm')) { if ($null -ne $sidecars[$name].Lease) { $sidecars[$name].Lease.Dispose(); $leases.Remove($sidecars[$name].Lease) | Out-Null } }
          $sidecars = $null
        }
        ($response | ConvertTo-Json -Compress -Depth 4); [Console]::Out.Flush(); continue
      }
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
        if ($ownedResources.Count -ne 0 -or $null -ne $publication -or $null -ne $sidecars) { Throw-G006BError 15 'retained resources remain at database lease release' }
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

} catch {
  $primary = $_.Exception
} finally {
  if ($Mode -ceq 'LeaseDatabase' -and (Get-Variable -Name publication -ErrorAction SilentlyContinue) -and $null -ne $publication) {
    try { $publication.Lease.Dispose(); $leases.Remove($publication.Lease) | Out-Null } catch { $cleanup.Add('publication release: ' + $_.Exception.Message) }
    $publication = $null
  }
  if ($Mode -ceq 'LeaseDatabase' -and (Get-Variable -Name ownedResources -ErrorAction SilentlyContinue)) {
    $remaining = @($ownedResources.Values | Sort-Object -Property Order -Descending)
    foreach ($resource in $remaining) {
      try {
        $current = Convert-Identity ([G006BNativeFile]::Inspect($resource.Lease)) 'resource-finalize' $resource.Directory
        Assert-IdentityExpectation $current $resource.Identity.volumeSerialNumber $resource.Identity.fileId
        if ($resource.Disposition -ceq 'cleanup' -and $resource.Owned) { [G006BNativeFile]::MarkDelete($resource.Lease) }
      } catch { $cleanup.Add(('resource {0} {1}: ' -f $resource.Disposition,$resource.Identity.fileId) + $_.Exception.Message) }
      try { $resource.Lease.Dispose(); $leases.Remove($resource.Lease) | Out-Null } catch { $cleanup.Add(('resource dispose {0}: ' -f $resource.Identity.fileId) + $_.Exception.Message) }
      try { [G006BNativeFile]::Flush($resource.Parent) } catch { $cleanup.Add(('resource parent flush {0}: ' -f $resource.Identity.fileId) + $_.Exception.Message) }
      $ownedResources.Remove($resource.Identity.finalPath)
    }
  }
  if ($Mode -ceq 'LeaseDatabase' -and $null -ne $lockLease) {
    try {
      if (Get-Variable -Name lockIdentity -ErrorAction SilentlyContinue) {
        $currentLock = Convert-Identity ([G006BNativeFile]::Inspect($lockLease)) 'lock-finalize'
        Assert-IdentityExpectation $currentLock $lockIdentity.volumeSerialNumber $lockIdentity.fileId
      }
      [G006BNativeFile]::MarkDelete($lockLease); $lockLease.Dispose(); $leases.Remove($lockLease) | Out-Null
      if ($null -ne $parentLease) { [G006BNativeFile]::Flush($parentLease) }
    } catch { $cleanup.Add('lease lock cleanup: ' + $_.Exception.Message) }
  }
  for ($index = $leases.Count - 1; $index -ge 0; $index--) {
    try { $leases[$index].Dispose() } catch { $cleanup.Add($_.Exception.Message) }
  }
}

$exitCode = if ($moved -or $publicationReady) { 14 } elseif ($null -ne $primary -and $primary.Data.Contains('G006BExitCode')) { [int]$primary.Data['G006BExitCode'] } else { 15 }
$prefix = if ($moved -or $publicationReady) { 'G006B_PUBLISHED_UNVERIFIED_RECOVERY_REQUIRED: ' } else { '' }
$details = if ($cleanup.Count -gt 0) { ' cleanup=[' + ($cleanup -join ' | ') + ']' } else { '' }
[Console]::Error.WriteLine($prefix + $primary.Message + $details)
exit $exitCode
