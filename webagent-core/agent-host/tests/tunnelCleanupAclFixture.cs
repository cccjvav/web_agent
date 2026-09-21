// Test-only DACL fixture; never shipped in installer.
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using Microsoft.Win32.SafeHandles;

public static class TunnelAclFixture
{
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern SafeProcessHandle OpenProcess(uint access, bool inherit, int pid);
    [DllImport("advapi32.dll", SetLastError=true)]
    private static extern bool GetKernelObjectSecurity(SafeProcessHandle h, uint flags, byte[] bytes, uint size, out uint needed);
    [DllImport("advapi32.dll", SetLastError=true)]
    private static extern bool SetKernelObjectSecurity(SafeProcessHandle h, uint flags, byte[] bytes);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool TerminateProcess(SafeProcessHandle h, uint code);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern uint WaitForSingleObject(SafeProcessHandle h, uint ms);

    [DllImport("advapi32.dll", SetLastError=true)]
    private static extern bool OpenProcessToken(IntPtr process, uint access, out SafeFileHandle token);
    [DllImport("advapi32.dll", SetLastError=true)]
    private static extern bool AdjustTokenPrivileges(SafeFileHandle token, bool disableAll, IntPtr state, uint size, IntPtr previous, IntPtr returned);

    private static void DisableFixturePrivileges()
    {
        // Full-framework Process inspection / elevated CI may enable SeDebugPrivilege.
        // Reduce only this disposable host's token, after gathering identity/restore handles.
        SafeFileHandle token;
        if (!OpenProcessToken(new IntPtr(-1), 0x20, out token)) throw new Win32Exception();
        using (token) {
            if (!AdjustTokenPrivileges(token, true, IntPtr.Zero, 0, IntPtr.Zero, IntPtr.Zero)) throw new Win32Exception();
        }
        Console.WriteLine("fixture-privileges-disabled");
    }
    private static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
    private static byte[] Save(SafeProcessHandle h)
    {
        uint needed;
        GetKernelObjectSecurity(h, 4, null, 0, out needed);
        Require(needed > 0 && needed <= 65536, "DACL size unavailable");
        byte[] bytes = new byte[needed];
        if (!GetKernelObjectSecurity(h, 4, bytes, needed, out needed)) throw new Win32Exception();
        return bytes;
    }
    private static void Set(SafeProcessHandle h, byte[] bytes)
    {
        if (!SetKernelObjectSecurity(h, 4, bytes)) throw new Win32Exception();
    }
    private static void Denied(int pid, uint mask, string phase)
    {
        using (var h = OpenProcess(mask, false, pid)) {
            int error = Marshal.GetLastWin32Error();
            Require(h.IsInvalid && error == 5, phase + ": expected ERROR_ACCESS_DENIED; invalid=" + h.IsInvalid + ", error=" + error);
        }
    }
    public static void Run(string program)
    {
        var info = new ProcessStartInfo(program, "-e \"setTimeout(()=>{},60000)\"");
        info.UseShellExecute = false; info.CreateNoWindow = true;
        using (var owner = Process.GetCurrentProcess())
        using (var child = Process.Start(info))
        using (var targetHandle = new SafeProcessHandle(child.Handle, false))
        using (var ownerHandle = OpenProcess(0x00060000, false, owner.Id)) {
            byte[] targetAcl = null, ownerAcl = null;
            try {
            Require(!targetHandle.IsInvalid && !ownerHandle.IsInvalid, "Test restore handles unavailable");
            targetAcl = Save(targetHandle); ownerAcl = Save(ownerHandle);
            var descriptor = new RawSecurityDescriptor("D:(D;;0x00101401;;;WD)(A;;GA;;;WD)");
            byte[] deniedAcl = new byte[descriptor.BinaryLength]; descriptor.GetBinaryForm(deniedAcl, 0);
            string targetStart = child.StartTime.ToUniversalTime().Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture);
            string targetExe = child.MainModule.FileName;
            string ownerStart = owner.StartTime.ToUniversalTime().Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture);
            string ownerExe = owner.MainModule.FileName;
                DisableFixturePrivileges();
                Set(targetHandle, deniedAcl);
                Denied(child.Id, 0x00101401, "target");
                using (var lease = new WebAgentTunnelLease(child.Id, targetStart, targetExe, owner.Id, ownerStart, ownerExe, "cloudflare", owner.Id)) {
                    Require(lease.Status == "inaccessible", "Denied target must not become a candidate");
                    Require(lease.Commit(500) == "inaccessible", "Denied target must not terminate");
                    Require(lease.Commit(500) == "not-started", "Lease must remain single-use");
                }
                Require(WaitForSingleObject(targetHandle, 0) == 258, "Denied target was terminated");
                Set(targetHandle, targetAcl);
                Set(ownerHandle, deniedAcl);
                Denied(owner.Id, 0x00101400, "owner");
                using (var lease = new WebAgentTunnelLease(child.Id, targetStart, targetExe, owner.Id, ownerStart, ownerExe, "cloudflare", owner.Id)) {
                    Require(lease.Status == "owner-unknown", "Denied live owner must not be mistaken for absent");
                    Require(lease.Commit(500) == "owner-unknown", "Denied owner must block termination");
                }
                Require(WaitForSingleObject(targetHandle, 0) == 258, "Owner uncertainty terminated target");
                Set(ownerHandle, ownerAcl);
                // A live PID blocks even when the receipt's owner birth is stale (not actual PID reuse).
                using (var lease = new WebAgentTunnelLease(child.Id, targetStart, targetExe, owner.Id, "1", ownerExe, "cloudflare", owner.Id)) {
                    Require(lease.Status == "active-owner", "Live owner with stale receipt birth must block");
                    Require(lease.Commit(500) == "active-owner", "Live owner protection changed after restore");
                }
                Require(WaitForSingleObject(targetHandle, 0) == 258, "Live owner's child was terminated");
                Console.WriteLine("TARGET_DENIED=5 OWNER_DENIED=5 inaccessible owner-unknown active-owner single-use passed");
            } finally {
                // Nested finally ensures disposal cannot be bypassed by a restore failure.
                try { if (ownerAcl != null) Set(ownerHandle, ownerAcl); }
                finally {
                    try { if (targetAcl != null) Set(targetHandle, targetAcl); }
                    finally {
                        if (WaitForSingleObject(targetHandle, 0) == 258) Require(TerminateProcess(targetHandle, 0), "Owned fixture termination failed");
                        Require(WaitForSingleObject(targetHandle, 5000) == 0, "Owned fixture exit unconfirmed");
                        Console.WriteLine("fixture-target-exited");
                    }
                }
            }
        }
    }
}
