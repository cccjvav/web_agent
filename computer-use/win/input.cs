// input.cs - foreground + mouse click (P/Invoke)
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class WinInput
{
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    // rect-window local (imgX,imgY) -> screen click
    public static string Click(IntPtr hwnd, int imgX, int imgY)
    {
        RECT r;
        if (!GetWindowRect(hwnd, out r)) return "ERR_NORECT";
        SetForegroundWindow(hwnd);
        Thread.Sleep(250);
        if (GetForegroundWindow() != hwnd) return "ERR_NOFOCUS";
        if (!GetWindowRect(hwnd, out r)) return "ERR_NORECT";
        if (imgX < 0 || imgY < 0 || imgX >= r.Right-r.Left || imgY >= r.Bottom-r.Top) return "ERR_BOUNDS";
        int sx = r.Left + imgX;
        int sy = r.Top + imgY;
        if (!SetCursorPos(sx, sy)) return "ERR_CURSOR";
        Thread.Sleep(80);
        if (GetForegroundWindow() != hwnd) return "ERR_NOFOCUS";
        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(40);
        mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
        return "SUBMITTED";
    }
}

