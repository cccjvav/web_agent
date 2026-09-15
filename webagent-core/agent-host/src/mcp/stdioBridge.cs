// Binary stdio relay hosted inside the existing Windows kill-on-close Job Object.
using System;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.IO;
public static class WebAgentStdioBridge
{
    public static string Quote(string value)
    {
        var result = new StringBuilder("\""); int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { result.Append('\\', slashes * 2 + 1); result.Append('"'); }
            else { result.Append('\\', slashes); result.Append(c); }
            slashes = 0;
        }
        result.Append('\\', slashes * 2); result.Append('"'); return result.ToString();
    }
    private static Thread Pump(Stream source, Stream target, bool closeTarget)
    {
        var thread = new Thread(delegate() {
            try {
                byte[] buffer = new byte[65536]; int count;
                while ((count = source.Read(buffer, 0, buffer.Length)) > 0) { target.Write(buffer, 0, count); target.Flush(); }
                if (closeTarget) target.Close();
            } catch (IOException) { Environment.Exit(125); }
              catch (ObjectDisposedException) { Environment.Exit(125); }
        });
        thread.IsBackground = true; thread.Start(); return thread;
    }
    public static int Run(string program, string[] args, string cwd, int parentPid, string[] envKeys)
    {
        WebAgentCommandJob.Attach(); // Must succeed BEFORE third-party code starts.
        var parent = Process.GetProcessById(parentPid);
        if (parent.HasExited) return 125;
        var watcher = new Thread(delegate() { try { parent.WaitForExit(); } finally { Environment.Exit(125); } });
        watcher.IsBackground = true; watcher.Start();
        var info = new ProcessStartInfo();
        info.FileName = program; info.WorkingDirectory = cwd;
        info.Arguments = String.Join(" ", Array.ConvertAll(args, Quote));
        info.EnvironmentVariables.Clear();
        foreach (string key in envKeys) { string value = Environment.GetEnvironmentVariable(key); if (value != null) info.EnvironmentVariables[key] = value; }
        info.UseShellExecute = false; info.CreateNoWindow = true;
        info.RedirectStandardInput = true; info.RedirectStandardOutput = true; info.RedirectStandardError = true;
        // Do not let PowerShell's startup input processing race the binary relay.
        // The parent queues requests until this guarded C# entry point is ready.
        byte[] ready = Encoding.UTF8.GetBytes("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/webagent/stdio-ready\"}\n");
        var control = Console.OpenStandardOutput(); control.Write(ready, 0, ready.Length); control.Flush();
        using (var child = Process.Start(info)) {
            // Each synchronous pipe pump owns a thread: no stream async implementation
            // may block startup of another direction on Windows PowerShell/.NET Framework.
            Thread output = Pump(child.StandardOutput.BaseStream, Console.OpenStandardOutput(), false);
            Thread error = Pump(child.StandardError.BaseStream, Console.OpenStandardError(), false);
            Pump(Console.OpenStandardInput(), child.StandardInput.BaseStream, true);
            child.WaitForExit();
            output.Join(2000); error.Join(2000);
            return child.ExitCode;
        }
    }
}
