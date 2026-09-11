// input2.cs - background click via PostMessage (no cursor move, no focus steal)
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class WinBgInput
{
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr hWnd, ref POINT p);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);

    public const uint WM_MOUSEMOVE = 0x0200;
    public const uint WM_LBUTTONDOWN = 0x0201;
    public const uint WM_LBUTTONUP = 0x0202;
    public const uint MK_LBUTTON = 0x0001;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }

    // returns "OK cx,cy sx,sy" where cx,cy=cursor before, sx,sy=cursor after
    public static string ClickBg(IntPtr hwnd, int imgX, int imgY)
    {
        POINT before;
        if (!GetCursorPos(out before)) return "ERR_CURSOR";
        if (!IsWindow(hwnd)) return "ERR_NOWINDOW";
        RECT r;
        if (!GetWindowRect(hwnd, out r)) return "ERR_NORECT";
        if (imgX < 0 || imgY < 0 || imgX >= r.Right-r.Left || imgY >= r.Bottom-r.Top) return "ERR_BOUNDS";
        POINT p;
        p.X = r.Left + imgX;
        p.Y = r.Top + imgY;
        if (!ScreenToClient(hwnd, ref p)) return "ERR_STC";
        if (p.X < 0 || p.Y < 0 || p.X > 32767 || p.Y > 32767) return "ERR_BOUNDS";
        int lParam = (p.Y << 16) | (p.X & 0xFFFF);
        if (!PostMessage(hwnd, WM_MOUSEMOVE, IntPtr.Zero, (IntPtr)lParam)) return "ERR_POSTMESSAGE";
        Thread.Sleep(60);
        if (!PostMessage(hwnd, WM_LBUTTONDOWN, (IntPtr)MK_LBUTTON, (IntPtr)lParam)) return "ERR_POSTMESSAGE";
        Thread.Sleep(100);
        if (!PostMessage(hwnd, WM_LBUTTONUP, IntPtr.Zero, (IntPtr)lParam)) return "ERR_POSTMESSAGE";
        Thread.Sleep(50);
        POINT after;
        if (!GetCursorPos(out after)) return "ERR_CURSOR_AFTER_SUBMISSION";
        return "SUBMITTED before=" + before.X + "," + before.Y + " after=" + after.X + "," + after.Y;
    }
}

