// keys.cs - keyboard primitives: background PostMessage (no focus steal) + foreground SendInput fallback
//  PasteClipboard : bg - posts Ctrl+V to target hwnd (clipboard already holds text); works with classic Win32 apps
//  SendChars      : bg - posts one WM_CHAR per UTF-16 code unit (classic edit controls)
//  PasteFg        : fg - real Ctrl+V via keybd_event; requires target to be/becoming foreground, else ERR_NOFOCUS (never blind-type)
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class WinBgKeys
{
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();

    public struct POINT { public int X; public int Y; }

    public const uint WM_KEYDOWN = 0x0100;
    public const uint WM_KEYUP   = 0x0101;
    public const uint WM_CHAR    = 0x0102;
    public const int  VK_CONTROL = 0x11;
    public const int  VK_V       = 0x56;
    public const uint KEYEVENTF_KEYUP = 0x0002;

    static string CursorText()
    {
        POINT c;
        if (!GetCursorPos(out c)) return "unknown";
        return c.X + "," + c.Y;
    }

    // background Ctrl+V; returns "OK before=x,y after=x,y"
    public static string PasteClipboard(IntPtr hwnd)
    {
        if (!IsWindow(hwnd)) return "ERR_NOWINDOW";
        string b = CursorText();
        if (!PostMessage(hwnd, WM_KEYDOWN, (IntPtr)VK_CONTROL, IntPtr.Zero)) return "ERR_POSTMESSAGE";
        bool ok = false, released;
        try {
            Thread.Sleep(50);
            ok = PostMessage(hwnd, WM_KEYDOWN, (IntPtr)VK_V, IntPtr.Zero);
        } finally {
            released = PostMessage(hwnd, WM_KEYUP, (IntPtr)VK_V, IntPtr.Zero);
            released &= PostMessage(hwnd, WM_KEYUP, (IntPtr)VK_CONTROL, IntPtr.Zero);
        }
        if (!ok || !released) return "ERR_POSTMESSAGE";
        Thread.Sleep(80);
        return "SUBMITTED before=" + b + " after=" + CursorText();
    }

    // fallback: WM_CHAR per char (classic edit controls only)
    public static string SendChars(IntPtr hwnd, string text)
    {
        if (!IsWindow(hwnd)) return "ERR_NOWINDOW";
        string b = CursorText();
        foreach (char ch in text)
        {
            if (!PostMessage(hwnd, WM_CHAR, (IntPtr)ch, IntPtr.Zero)) return "ERR_POSTMESSAGE_PARTIAL";
            Thread.Sleep(10);
        }
        return "SUBMITTED before=" + b + " after=" + CursorText();
    }

    // real Ctrl+V: safe foreground typing. Requires hwnd to be foreground (or successfully brought foreground);
    // otherwise returns ERR_NOFOCUS and sends nothing, focus may still change during submission; inspect the application afterwards.
    public static string PasteFg(IntPtr hwnd)
    {
        if (!IsWindow(hwnd)) return "ERR_NOWINDOW";
        IntPtr fg = GetForegroundWindow();
        if (fg != hwnd)
        {
            SetForegroundWindow(hwnd);
            Thread.Sleep(400);
            fg = GetForegroundWindow();
        }
        if (fg != hwnd) return "ERR_NOFOCUS";
        string b = CursorText();
        keybd_event((byte)VK_CONTROL, 0x1D, 0, UIntPtr.Zero);
        keybd_event((byte)VK_V, 0x2F, 0, UIntPtr.Zero);
        keybd_event((byte)VK_V, 0x2F, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event((byte)VK_CONTROL, 0x1D, KEYEVENTF_KEYUP, UIntPtr.Zero);
        Thread.Sleep(120);
        return "SUBMITTED before=" + b + " after=" + CursorText();
    }
}

