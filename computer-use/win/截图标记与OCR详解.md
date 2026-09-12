# Windows截图、几何、标记与OCR逐实现讲解

覆盖[capture.cs](capture.cs)、[snap.ps1](snap.ps1)、[info.ps1](info.ps1)、[mark.cs](mark.cs)、[mark.ps1](mark.ps1)、[ocr.ps1](ocr.ps1)。这些操作实际桌面/图片，不是浏览器DOM工具；不应在含隐私的桌面上随意测试。PS脚本通过Add-Type编译C#，不是Node require。

## 1. capture.cs全部声明和方法

静态类**WinCapture**使用System.Drawing/GDI和user32。P/Invoke **GetWindowRect(hwnd,out RECT)**返回窗口外框屏幕矩形，失败false；**GetSystemMetrics(nIndex)**查询虚拟桌面指标。**RECT**以Sequential四个int Left/Top/Right/Bottom对应原生布局，宽高要做右减左/下减上。

**JpegCodec()**遍历ImageCodecInfo.GetImageEncoders，MimeType为image/jpeg返回，否则null；不是下载编码器。

**CaptureRect(x,y,w,h,outPath,quality,fmt)**宽高≤0直接ERR_BOUNDS；try using Bitmap24bppRGB，再using Graphics.CopyFromScreen把屏幕区域复制到图像0,0，释放Graphics；目标目录非空则CreateDirectory。fmt=1保存PNG，其他创建EncoderParameters/Quality并用JpegCodec保存JPEG。成功OK，Exception转ERR:message。quality没有本方法内范围clamp，异常会转换；EncoderParameters没有using显式Dispose，与Bitmap/Graphics不同。

**CaptureWindow(hwnd,...)**GetWindowRect失败ERR_NORECT，否则CaptureRect外框；这是屏幕像素截取，**不是PrintWindow离屏重绘**，被遮挡/最小化不保证得到窗口真实内容。

**CaptureFull(outPath,quality,fmt)**用76/77/78/79取虚拟屏幕x/y/w/h再CaptureRect；多屏原点可能为负，不是永远主屏0,0。没有在本文件启用统一DPI awareness，坐标在不同Windows缩放环境必须实际校对。

## 2. snap.ps1参数与执行

Out默认skills/computer-use/state/screen.png，WindowTitle空表示全屏，Quality80，B64开关。UTF8输出、Stop异常策略；从脚本目录找capture.cs并Add-Type引用System.Drawing。Out后缀jpg/jpeg用JPEG，否则PNG；输出路径用当前Get-Location与Out Join-Path，不是固定脚本目录。

有WindowTitle：Get-Process管道Where-Object按通配`*title*`匹配，Select-Object First1；无结果输出ERR_NO_WINDOW/exit2；有结果调用CaptureWindow。无标题调用CaptureFull。**这里选择第一项，不像输入脚本要求唯一匹配**，星号/问号还具通配含义；截图确认时必须核对META.window，别把标题模糊匹配当唯一窗口身份证。

返回非OK输出CAP_ERR/exit3；成功Get-Item，再可选GetWindowRect构x/y/width/height；输出META JSON含file/bytes/window/rect。B64额外读全文件输出LEN=字节数、base64、END，增加内存/输出预算，不是自动上传任意服务。无额外try兜底的Add-Type/路径失败会由PowerShell异常结束。

输出参数可指向本机可写位置；这些脚本本身没有patchEngine路径沙箱，不能说所有截图写入都受通用补丁锁保护。

## 3. info.ps1与嵌入C#

无参数。UTF8；Add-Type here-string定义**Win32Info**，仅声明GetSystemMetrics(int)/GetDpiForSystem()两个user32导入；Add-Type错误SilentlyContinue（例如重复类型）不代表后续类型调用一定可用。

取76–79虚拟屏幕几何；GetDpiForSystem失败catch回96。Get-Process→Where-Object筛有标题且非零主句柄→ForEach-Object生成pid/name/title；最终JSON含virtual_screen/system_dpi、Round(dpi/96,2) scale、windows数组，Depth4/Compress。仅报告系统DPI，**不是每个显示器或每个窗口的实际缩放矩阵**。窗口列表只主窗口，非所有子控件/弹窗树。

## 4. mark.cs全部方法

静态类**WinMark.Mark(inPath,outPath,pts,size,label)**try using Bitmap输入+Graphics抗锯齿，pts按逗号拆非空项，每项按冒号int.Parse x/y；逐点idx++。先**DrawMarker**白色粗线(size+4,pen7)，再红色细线(size,pen3)。多点且idx≤99时Arial11粗体MeasureString，右上绘半透明黑偏移阴影再白数字；Font/Brush均using。

绘完后大小写不敏感比较原始inPath/outPath字符串，相同ERR_SAME_FILE；否则创建目标目录保存PNG；成功手工拼JSON in/out/pts/ok。**未JSON转义路径反斜杠/引号**，因此Windows返回文本不保证是合法JSON；label参数未使用。路径只文本比较不是realpath同一文件校验，不宣称能阻止所有路径别名覆写。size/点数/越界坐标未全面校验，异常返回ERR message。

**DrawMarker(Graphics g,x,y,size,Color c,penW)**using Pen，中心圆环（x-size/2,y-size/2,width=size）、水平/竖直臂(x±size/y±size)、3px中心小环；不用鼠标，不点击窗口。绘制半径/臂长不是目标控件大小判定。

## 5. mark.ps1路径与错误

Path默认skills/computer-use/shots/cur.png，Pts必需，Out空、Size20。缺Pts输出ERR_NO_PTS/exit2；编译mark.cs/System.Drawing，Resolve-Path输入；Out绝对或包含冒号直接用，其他相对输入图片目录，默认同目录base-marked.png；调用WinMark.Mark传空label。返回StartsWith ERR输出/exit1，其他原样输出。

标记坐标是**输入图像像素**。只有截图未缩放、来自同一窗口外框，才与输入脚本imgX/imgY相对应；全屏截图、裁图、DPI变化不能盲目直接送act-bg。mark只是预览，之后点击/窗口变化要再确认。

## 6. ocr.ps1所有函数与循环

Path默认skills/computer-use/state/game.png，UTF8/Stop；加载WindowsRuntime并引用StorageFile/OcrEngine/BitmapDecoder类型。GetMethods+Where-Object找单参数IAsyncOperation`1的AsTask泛型重载，取首个。

**Await($t,$rt)**MakeGenericMethod输出类型，Invoke把WinRT operation转Task，Wait(-1)无限等并丢等待返回，再取Result。没有超时或取消，外层进程超时才可能停止等待；缺Windows组件/重载会异常。

Resolve-Path→StorageFile.GetFileFromPathAsync→OpenAsync(Read)→BitmapDecoder.CreateAsync→GetSoftwareBitmapAsync，均Await。TryCreateFromUserProfileLanguages无引擎打印NO_OCR_ENGINE/exit2；RecognizeAsync得到结果。

外层foreach line，内层foreach word：取最小X与最大右边界；topY/hh取**最左单词**的Y/Height，不是全行所有单词的严格包围框。无word跳过；输出TEXT整数x/y/宽/h/line.Text，末尾IMG宽x高。未显式Dispose stream/softwareBitmap、未自动旋转/缩放大图，不保证识别语言已安装或100%准确。

## 7. 验证边界

CI解析所有PS1语法，但当前Windows编译步骤只覆盖input/input2/keys三个C#，不能冒充capture/mark的实际GDI/OCR验证。请在独立测试桌面执行截图→看META→标记→人工校准再操作；OCR不等于视觉确认。

`npm test --prefix webagent-core/agent-host -- --filter=installerPackaging`仅关联脚本静态/打包回归，不是截图实测。本轮Linux环境不执行Windows截图或OCR，也不会启动桌面输入来“自动验证”文档。
