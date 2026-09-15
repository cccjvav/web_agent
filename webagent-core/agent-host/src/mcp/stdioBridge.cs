// Binary stdio relay hosted inside the existing Windows kill-on-close Job Object.
using System;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
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
        using (var child = Process.Start(info)) {
            Task output = child.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
            Task error = child.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
            Task.Run(delegate() { try { Console.OpenStandardInput().CopyTo(child.StandardInput.BaseStream); child.StandardInput.Close(); } catch (System.IO.IOException) { } });
            child.WaitForExit();
            Task.WaitAll(new Task[] { output, error }, 2000);
            return child.ExitCode;
        }
    }
}
