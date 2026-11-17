using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

class CaptureProgram
{
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool GetCursorInfo(ref CURSORINFO info);
    [DllImport("user32.dll")] static extern bool DrawIconEx(IntPtr hdc, int x, int y, IntPtr hIcon, int cx, int cy, int step, IntPtr brush, int flags);

    [StructLayout(LayoutKind.Sequential)]
    struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    struct CURSORINFO
    {
        public int cbSize;
        public int flags;
        public IntPtr hCursor;
        public POINT ptScreenPos;
    }

    const int CURSOR_SHOWING = 0x00000001;
    const int DI_NORMAL = 0x0003;

    static void Main(string[] args)
    {
        try { SetProcessDPIAware(); } catch { }

        int targetW;
        int targetH;
        int quality;
        int targetFps;
        Rectangle bounds;
        if (args != null && args.Length >= 8)
        {
            bounds = new Rectangle(Arg(args, 0, 0), Arg(args, 1, 0), Arg(args, 2, 1920), Arg(args, 3, 1080));
            targetW = Arg(args, 4, 1920);
            targetH = Arg(args, 5, 1080);
            quality = Arg(args, 6, 66);
            targetFps = Arg(args, 7, 15);
        }
        else
        {
            int displayIndex = Arg(args, 0, 0);
            targetW = Arg(args, 1, 1920);
            targetH = Arg(args, 2, 1080);
            quality = Arg(args, 3, 66);
            targetFps = Arg(args, 4, 12);
            Screen[] screens = Screen.AllScreens;
            if (screens.Length == 0) return;
            if (displayIndex < 0 || displayIndex >= screens.Length) displayIndex = 0;
            bounds = screens[displayIndex].Bounds;
        }
        if (targetFps < 1) targetFps = 1;
        int interval = Math.Max(10, 1000 / targetFps);
        if (bounds.Width <= 0 || bounds.Height <= 0) return;

        double scale = Math.Min(1.0, Math.Min(targetW / (double)bounds.Width, targetH / (double)bounds.Height));
        int outW = Math.Max(2, (int)Math.Round(bounds.Width * scale));
        int outH = Math.Max(2, (int)Math.Round(bounds.Height * scale));

        ImageCodecInfo jpeg = null;
        foreach (ImageCodecInfo codec in ImageCodecInfo.GetImageEncoders())
        {
            if (codec.FormatID == ImageFormat.Jpeg.Guid) { jpeg = codec; break; }
        }
        if (jpeg == null) return;
        EncoderParameters encParams = new EncoderParameters(1);
        encParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)Math.Max(20, Math.Min(90, quality)));

        using (Bitmap source = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format24bppRgb))
        using (Bitmap output = new Bitmap(outW, outH, PixelFormat.Format24bppRgb))
        using (Graphics sourceGraphics = Graphics.FromImage(source))
        using (Graphics outputGraphics = Graphics.FromImage(output))
        using (MemoryStream stream = new MemoryStream(256 * 1024))
        {
            outputGraphics.InterpolationMode = InterpolationMode.Bilinear;
            outputGraphics.PixelOffsetMode = PixelOffsetMode.HighSpeed;
            outputGraphics.CompositingQuality = CompositingQuality.HighSpeed;
            outputGraphics.SmoothingMode = SmoothingMode.None;

            Stopwatch watch = new Stopwatch();
            while (true)
            {
                watch.Restart();
                try
                {
                    sourceGraphics.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bounds.Size, CopyPixelOperation.SourceCopy);
                    outputGraphics.DrawImage(source, 0, 0, outW, outH);
                    // 不再把远端鼠标画进画面：控制端用本地光标覆盖层，避免一快一慢两个鼠标

                    stream.SetLength(0);
                    output.Save(stream, jpeg, encParams);
                    string data = Convert.ToBase64String(stream.GetBuffer(), 0, (int)stream.Length);
                    Console.Out.Write(outW.ToString() + " " + outH.ToString() + " " + data);
                    Console.Out.Write('\n');
                    Console.Out.Flush();
                }
                catch
                {
                    // Keep the stream alive; a transient GDI/desktop switch error should not kill the session.
                }

                int elapsed = (int)watch.ElapsedMilliseconds;
                int sleep = interval - elapsed;
                if (sleep > 0) Thread.Sleep(sleep);
            }
        }
    }

    static void DrawCursor(Graphics outputGraphics, Rectangle bounds, double scale)
    {
        try
        {
            CURSORINFO info = new CURSORINFO();
            info.cbSize = Marshal.SizeOf(typeof(CURSORINFO));
            if (!GetCursorInfo(ref info)) return;
            if ((info.flags & CURSOR_SHOWING) == 0 || info.hCursor == IntPtr.Zero) return;
            int x = info.ptScreenPos.X;
            int y = info.ptScreenPos.Y;
            if (x < bounds.Left || x >= bounds.Right || y < bounds.Top || y >= bounds.Bottom) return;
            int destX = (int)Math.Round((x - bounds.Left) * scale);
            int destY = (int)Math.Round((y - bounds.Top) * scale);
            IntPtr hdc = outputGraphics.GetHdc();
            try { DrawIconEx(hdc, destX, destY, info.hCursor, 0, 0, 0, IntPtr.Zero, DI_NORMAL); }
            finally { outputGraphics.ReleaseHdc(hdc); }
        }
        catch { }
    }

    static int Arg(string[] args, int index, int fallback)
    {
        int value;
        if (args != null && args.Length > index && int.TryParse(args[index], out value)) return value;
        return fallback;
    }
}
