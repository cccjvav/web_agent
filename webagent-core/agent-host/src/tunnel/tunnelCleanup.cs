// Windows-only lease: query and terminate the SAME kernel process object, never a PID re-open.
using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

public sealed class WebAgentTunnelLease : IDisposable
{
    private SafeProcessHandle target;
    private readonly int pid, ownerPid;
    private readonly string start, executable, ownerStart, ownerExecutable;
    private bool consumed;
    public string Status { get; private set; }
    private const uint WAIT_OBJECT_0 = 0, WAIT_TIMEOUT = 258;
    private const uint QUERY = 0x1000 | 0x0400 | 0x100000;
    [StructLayout(LayoutKind.Sequential)]
    private struct Times { public uint Low, High; }
    [StructLayout(LayoutKind.Sequential)]
    private struct BasicInfo { public IntPtr Reserved1, Peb, Reserved2, Reserved3, Pid, ParentPid; }
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern SafeProcessHandle OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetProcessTimes(SafeProcessHandle handle, out Times creation, out Times exit, out Times kernel, out Times user);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool QueryFullProcessImageName(SafeProcessHandle handle, uint flags, StringBuilder path, ref uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(SafeProcessHandle handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(SafeProcessHandle handle, uint exitCode);
    [DllImport("ntdll.dll")]
    private static extern int NtQueryInformationProcess(SafeProcessHandle handle, int infoClass, out BasicInfo info, int size, out int returned);

    private static bool Matches(SafeProcessHandle handle, string expectedStart, string expectedPath)
    {
        Times creation, exit, kernel, user;
        if (!GetProcessTimes(handle, out creation, out exit, out kernel, out user)) return false;
        long fileTime = ((long)creation.High << 32) | creation.Low;
        string born = DateTime.FromFileTimeUtc(fileTime).Ticks.ToString(CultureInfo.InvariantCulture);
        var name = new StringBuilder(32768); uint length = (uint)name.Capacity;
        return born == expectedStart && QueryFullProcessImageName(handle, 0, name, ref length)
            && String.Equals(name.ToString(), expectedPath, StringComparison.OrdinalIgnoreCase);
    }
    private string OwnerState()
    {
        using (var owner = OpenProcess(QUERY, false, ownerPid)) {
            if (owner.IsInvalid) return Marshal.GetLastWin32Error() == 87 ? "gone" : "owner-unknown";
            uint state = WaitForSingleObject(owner, 0);
            // ANY live occupant of the owner's PID blocks cleanup, even after PID reuse.
            if (state == WAIT_TIMEOUT) return "active-owner";
            if (state != WAIT_OBJECT_0 || !Matches(owner, ownerStart, ownerExecutable)) return "owner-unknown";
            return "gone";
        }
    }
    private string Check()
    {
        if (target == null || target.IsInvalid || target.IsClosed) return "inaccessible";
        uint state = WaitForSingleObject(target, 0);
        if (state == WAIT_OBJECT_0) return "exited";
        if (state != WAIT_TIMEOUT) return "inaccessible";
        if (!Matches(target, start, executable)) return "identity-changed";
        BasicInfo info; int returned;
        if (NtQueryInformationProcess(target, 0, out info, Marshal.SizeOf(typeof(BasicInfo)), out returned) != 0) return "inaccessible";
        if (info.Pid.ToInt64() != pid || info.ParentPid.ToInt64() != ownerPid) return "parent-mismatch";
        string owner = OwnerState();
        return owner == "gone" ? "candidate" : owner;
    }
    public WebAgentTunnelLease(int targetPid, string targetStart, string targetExe, int hostPid, string hostStart, string hostExe, string provider, int controllerPid)
    {
        pid = targetPid; start = targetStart; executable = targetExe;
        ownerPid = hostPid; ownerStart = hostStart; ownerExecutable = hostExe;
        Status = "invalid-record";
        try {
            if (pid <= 0 || ownerPid <= 0 || pid == ownerPid) return;
            if (pid == Process.GetCurrentProcess().Id || pid == controllerPid) { Status = "protected-process"; return; }
            string expectedName = provider == "ngrok" ? "ngrok.exe" : (provider == "cloudflare" || provider == "cloudflare-named") ? "cloudflared.exe" : "";
            if (expectedName.Length == 0 || !String.Equals(Path.GetFileName(executable), expectedName, StringComparison.OrdinalIgnoreCase)) { Status = "unsupported-binary"; return; }
            target = OpenProcess(QUERY | 0x0001, false, pid);
            if (target.IsInvalid) { Status = Marshal.GetLastWin32Error() == 87 ? "exited" : "inaccessible"; }
            else Status = Check();
        } catch { Status = "inaccessible"; }
        if (Status != "candidate") Dispose();
    }
    public string Commit(int waitMilliseconds)
    {
        if (consumed) return "not-started";
        consumed = true;
        if (Status != "candidate") return Status;
        if (waitMilliseconds <= 0) return "not-started";
        try {
            string current = Check(); // Recheck on the held target handle and recheck live owner immediately before action.
            if (current != "candidate") return current;
            if (!TerminateProcess(target, 1)) return WaitForSingleObject(target, 0) == WAIT_OBJECT_0 ? "exited" : "failed";
            return WaitForSingleObject(target, (uint)Math.Min(waitMilliseconds, 500)) == WAIT_OBJECT_0 ? "terminated" : "unconfirmed";
        } catch { return "unconfirmed"; }
        finally { Dispose(); }
    }
    public void Dispose() { if (target != null) { target.Dispose(); target = null; } }
}
