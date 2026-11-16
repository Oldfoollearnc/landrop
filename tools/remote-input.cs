using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

class Program
{
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);

    const uint LEFTDOWN = 0x0002, LEFTUP = 0x0004;
    const uint RIGHTDOWN = 0x0008, RIGHTUP = 0x0010;
    const uint MIDDLEDOWN = 0x0020, MIDDLEUP = 0x0040;
    const uint WHEEL = 0x0800;
    const uint KEYUP = 0x0002;

    static void Main()
    {
        string line;
        while ((line = Console.ReadLine()) != null)
        {
            try
            {
                line = line.Trim();
                if (line.Length == 0) continue;
                string[] p = line.Split(' ');
                string cmd = p[0].ToUpperInvariant();
                if (cmd == "MM" && p.Length >= 3)
                {
                    int x, y;
                    if (int.TryParse(p[1], out x) && int.TryParse(p[2], out y)) SetCursorPos(x, y);
                }
                else if (cmd == "MMN" && p.Length >= 3)
                {
                    double nx, ny;
                    if (double.TryParse(p[1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out nx)
                        && double.TryParse(p[2], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out ny))
                    {
                        int w = GetSystemMetrics(0), h = GetSystemMetrics(1);
                        SetCursorPos((int)Math.Round(nx * (w - 1)), (int)Math.Round(ny * (h - 1)));
                    }
                }
                else if (cmd == "MD" && p.Length >= 2) MouseDown(p[1]);
                else if (cmd == "MU" && p.Length >= 2) MouseUp(p[1]);
                else if (cmd == "MW" && p.Length >= 2)
                {
                    int delta;
                    if (int.TryParse(p[1], out delta)) mouse_event(WHEEL, 0, 0, delta, UIntPtr.Zero);
                }
                else if (cmd == "KD" && p.Length >= 2)
                {
                    int vk;
                    if (int.TryParse(p[1], out vk)) keybd_event((byte)vk, (byte)MapVirtualKey((uint)vk, 0), 0, UIntPtr.Zero);
                }
                else if (cmd == "KU" && p.Length >= 2)
                {
                    int vk;
                    if (int.TryParse(p[1], out vk)) keybd_event((byte)vk, (byte)MapVirtualKey((uint)vk, 0), KEYUP, UIntPtr.Zero);
                }
                else if (cmd == "TX")
                {
                    string text = line.Length > 3 ? line.Substring(3) : "";
                    if (text.Length > 0)
                    {
                        try { Clipboard.SetText(text); } catch { }
                        keybd_event(0x11, 0, 0, UIntPtr.Zero);
                        keybd_event(0x56, 0, 0, UIntPtr.Zero);
                        keybd_event(0x56, 0, KEYUP, UIntPtr.Zero);
                        keybd_event(0x11, 0, KEYUP, UIntPtr.Zero);
                    }
                }
            }
            catch { }
        }
    }

    static void MouseDown(string b)
    {
        if (b == "right") mouse_event(RIGHTDOWN, 0, 0, 0, UIntPtr.Zero);
        else if (b == "middle") mouse_event(MIDDLEDOWN, 0, 0, 0, UIntPtr.Zero);
        else mouse_event(LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
    }
    static void MouseUp(string b)
    {
        if (b == "right") mouse_event(RIGHTUP, 0, 0, 0, UIntPtr.Zero);
        else if (b == "middle") mouse_event(MIDDLEUP, 0, 0, 0, UIntPtr.Zero);
        else mouse_event(LEFTUP, 0, 0, 0, UIntPtr.Zero);
    }
}
