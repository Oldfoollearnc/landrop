; 近传 NearSend · NSIS 安装脚本
; ---------------------------------------------------------------------------
; 商用安装流程：欢迎 → 许可协议 → 安装位置 → 开机启动 → 安装 → 完成
;
;   1. 安装前静默结束正在运行的旧实例（托盘常驻会锁住 exe），
;      不让用户自己去任务管理器里点「结束任务」。
;   2. 同一应用标识（com.nearsend.app）已安装：就地覆盖升级，不弹确认；
;      版本相同视为修复安装；只有安装包确实比已安装版本旧时才提示。
;      （VersionCompare：1 = 第一个版本更高，2 = 第二个更高，0 = 相同）
;   3. 检测旧品牌 LanDrop（appId 不同，Windows 会当成另一个软件），
;      先静默卸载再安装，保证一台电脑只留一个近传。
;   4. 首次从 LanDrop 升级时，把用户数据（配置、聊天记录、解密密钥）搬到新目录。
;   5. 安装器里提供「开机自动启动」选项，写注册表并留标记给程序首次启动同步。
;   6. 卸载时移除自启动项，但保留 %APPDATA%\NearSend（聊天记录不丢）。
;
; 注意：检测逻辑必须内联在宏里。写成独立 Function 的话，卸载器那一遍编译
; 没人调用它，makensis 会报 warning 6010，而 electron-builder 默认把警告当错误。

!include "LogicLib.nsh"
!include "WordFunc.nsh"
!include "nsDialogs.nsh"

; 安装向导里凡是展示给用户的产品名都统一成中文品牌。
; 只影响窗口标题/页脚等显示文本；安装目录与 NearSend.exe 仍用 APP_FILENAME，
; 否则会破坏 1.0.x -> 2.0.0 的就地覆盖升级。
!undef PRODUCT_NAME
!define PRODUCT_NAME "近传 NearSend"

; ---------------------------------------------------------------------------
; 覆盖 electron-builder 的「应用正在运行，请先关闭」提示
; ---------------------------------------------------------------------------
; 托盘常驻程序在升级/卸载时通常还在跑，弹框让用户手动关闭既多余又容易
; 导致覆盖失败。这里直接结束进程，让安装/卸载继续。
!macro customCheckAppRunning
  DetailPrint "正在关闭正在运行的近传…"
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /f /im "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /f /im "LanDrop.exe"'
  Pop $0
  Sleep 800
!macroend

; ---------------------------------------------------------------------------
; 安装初始化：版本关系 + 旧品牌检测
; ---------------------------------------------------------------------------
; 全新安装时 electron-builder 的 multiUser.nsh 会调用
; SHGetKnownFolderPath，再用 System 插件按 1024 个宽字符去读返回的短字符串，
; 在部分机器上会偶发 0xC0000005（安装器一启动就崩，且只在全新安装时出现）。
; preInit 早于 initMultiUser 执行，这里先把 InstallLocation 写好，
; 让模板走「读现有安装位置」的分支，绕开那段不安全的调用。
!macro preInit
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $0 == ""
    ReadRegStr $1 HKCU "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
    ${If} $1 == ""
      StrCpy $1 "$LOCALAPPDATA\Programs\${APP_FILENAME}"
    ${EndIf}
    WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation" "$1"
  ${EndIf}
!macroend

!macro customInit
  ; 变量必须声明在宏内：卸载器那一遍不会展开本宏，
  ; 放在文件顶层会变成「未引用的变量」警告（electron-builder 把警告当错误）
  Var /GLOBAL LegacyDir
  Var /GLOBAL LegacyUninstaller

  ; ---------- 1. 同一品牌的已安装版本 ----------
  ${IfNot} ${Silent}
    ReadRegStr $R9 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ${If} $R9 != ""
      ${VersionCompare} "$R9" "${VERSION}" $R8
      ${If} $R8 == 1
        MessageBox MB_OKCANCEL|MB_ICONINFORMATION "这台电脑已经安装了更新版本的近传（$R9）。$\r$\n$\r$\n本次安装包是 ${VERSION}，继续安装会把程序文件换回旧版，聊天记录不受影响。$\r$\n$\r$\n确定要安装吗？" IDOK SameBrandOk
        Abort
        SameBrandOk:
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ; ---------- 2. 旧品牌 LanDrop ----------
  ; preInit 预写的 InstallLocation 会让模板以为「已经装过」，
  ; 但注册表里没有卸载项时其实是全新安装；改回去，页面上才会显示「首次安装」
  ; 而不是「已经存在一个安装…即将重新安装/升级」。
  ReadRegStr $R8 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${If} $R8 == ""
    StrCpy $hasPerUserInstallation "0"
    StrCpy $perUserInstallationFolder ""
  ${EndIf}

  StrCpy $LegacyDir ""
  StrCpy $LegacyUninstaller ""

  IfFileExists "$LOCALAPPDATA\Programs\LanDrop\Uninstall LanDrop.exe" 0 LanDropCheckPF64
  StrCpy $LegacyDir "$LOCALAPPDATA\Programs\LanDrop"
  Goto LanDropFound

  LanDropCheckPF64:
  IfFileExists "$PROGRAMFILES64\LanDrop\Uninstall LanDrop.exe" 0 LanDropCheckPF32
  StrCpy $LegacyDir "$PROGRAMFILES64\LanDrop"
  Goto LanDropFound

  LanDropCheckPF32:
  IfFileExists "$PROGRAMFILES32\LanDrop\Uninstall LanDrop.exe" 0 LanDropCheckReg
  StrCpy $LegacyDir "$PROGRAMFILES32\LanDrop"
  Goto LanDropFound

  ; 注册表兜底：装在自定义目录里的旧版
  LanDropCheckReg:
  StrCpy $R2 0
  LanDropRegLoop:
    EnumRegKey $R3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R2
    StrCmp $R3 "" LanDropNotFound
    IntOp $R2 $R2 + 1
    ReadRegStr $R4 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R3" "DisplayName"
    StrCpy $R5 $R4 7
    StrCmp $R5 "LanDrop" 0 LanDropRegLoop
    ReadRegStr $R6 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R3" "InstallLocation"
    ${If} $R6 == ""
      Goto LanDropRegLoop
    ${EndIf}
    IfFileExists "$R6\Uninstall LanDrop.exe" 0 LanDropRegLoop
    StrCpy $LegacyDir "$R6"
    Goto LanDropFound

  LanDropFound:
  StrCpy $LegacyUninstaller "$LegacyDir\Uninstall LanDrop.exe"
  ${IfNot} ${Silent}
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "检测到旧版本「局域网传信 LanDrop」：$\r$\n$LegacyDir$\r$\n$\r$\n为了让电脑上只保留一个近传，安装前会先卸载它；原来的聊天记录和配对信息会自动迁移。$\r$\n$\r$\n是否继续？" IDOK LanDropOk
    Abort
    LanDropOk:
  ${EndIf}
  Goto LanDropDone

  LanDropNotFound:
  StrCpy $LegacyDir ""
  StrCpy $LegacyUninstaller ""

  LanDropDone:

  ; ---------- 3. 开机启动的默认值 ----------
  ; 静默安装不会显示选项页，全靠这里算出的默认值：
  ;   · 已有自启动项（旧版开着）      -> 保持开启，装完重写为新的 exe 路径
  ;   · 已安装过且没有自启动项        -> 尊重用户之前的关闭选择
  ;   · 全新安装                      -> 默认开启
  StrCpy $AutoStartState "1"
  ReadRegStr $R7 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "NearSend"
  ${If} $R7 == ""
    ReadRegStr $R8 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ${If} $R8 != ""
      StrCpy $AutoStartState "0"
    ${EndIf}
  ${EndIf}
!macroend

; ---------------------------------------------------------------------------
; 「安装位置」之后的自启动选项页
; ---------------------------------------------------------------------------
!macro customPageAfterChangeDir
  Var /GLOBAL AutoStartState
  Var /GLOBAL AutoStartCheck

  Page custom nsAutoStartPageCreate nsAutoStartPageLeave

  Function nsAutoStartPageCreate
    ${If} ${Silent}
      Abort
    ${EndIf}

    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ; 自定义页不会自动继承 MUI 的页头，必须自己改标题和副标题，
    ; 否则页面顶部还留着上一页「选定安装位置」的字样。
    GetDlgItem $0 $HWNDPARENT 1037
    SendMessage $0 ${WM_SETTEXT} 0 "STR:开机启动"
    GetDlgItem $0 $HWNDPARENT 1038
    SendMessage $0 ${WM_SETTEXT} 0 "STR:选择近传是否随 Windows 一起启动。"

    ${NSD_CreateLabel} 0 6u 100% 34u "开启后，登录 Windows 时近传会在托盘后台启动，手机随时可以发消息过来；不会弹出窗口。安装完成后也可以在程序设置里关闭。"
    Pop $0
    SetCtlColors $0 0x6B6B73 transparent

    ${NSD_CreateCheckbox} 0 52u 100% 14u "开机时自动启动近传（推荐）"
    Pop $AutoStartCheck
    ${If} $AutoStartState == "1"
      ${NSD_Check} $AutoStartCheck
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function nsAutoStartPageLeave
    ; 静默安装不会显示页面，此时必须保留 customInit 里算出的默认值
    ${If} ${Silent}
      Return
    ${EndIf}
    ${If} $AutoStartCheck == 0
      Return
    ${EndIf}
    ${NSD_GetState} $AutoStartCheck $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $AutoStartState "1"
    ${Else}
      StrCpy $AutoStartState "0"
    ${EndIf}
  FunctionEnd
!macroend

; ---------------------------------------------------------------------------
; 安装完成后的收尾
; ---------------------------------------------------------------------------
!macro customInstall
  ; ---------- 1. 卸载旧品牌 LanDrop ----------
  ${If} $LegacyUninstaller != ""
    nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /f /im "LanDrop.exe"'
    Pop $0
    ExecWait '"$LegacyUninstaller" /S _?=$LegacyDir' $1
    Sleep 1500

    Delete "$DESKTOP\LanDrop.lnk"
    Delete "$SMPROGRAMS\LanDrop.lnk"
    RMDir /r "$SMPROGRAMS\LanDrop"
    RMDir /r "$LegacyDir"
  ${EndIf}

  ; ---------- 2. 迁移旧品牌用户数据 ----------
  ; 只在「新目录还没有配置」时搬一次；程序启动时也有同样的迁移逻辑做兜底。
  ${If} ${FileExists} "$APPDATA\LanDrop\config.json"
  ${AndIfNot} ${FileExists} "$APPDATA\NearSend\config.json"
    CreateDirectory "$APPDATA\NearSend"
    CopyFiles /SILENT "$APPDATA\LanDrop\config.json" "$APPDATA\NearSend"
    CopyFiles /SILENT "$APPDATA\LanDrop\messages.jsonl" "$APPDATA\NearSend"
    CopyFiles /SILENT "$APPDATA\LanDrop\messages.key" "$APPDATA\NearSend"
    ; Local State 里存着 safeStorage 的解密密钥，缺了它旧聊天记录打不开
    CopyFiles /SILENT "$APPDATA\LanDrop\Local State" "$APPDATA\NearSend"
    CopyFiles /SILENT "$APPDATA\LanDrop\Preferences" "$APPDATA\NearSend"
  ${EndIf}

  ; ---------- 3. 自启动 ----------
  ; 立即写注册表让「装完就能开机启动」，同时留一个标记文件，
  ; 程序首次启动时按它更新配置（覆盖升级时也能尊重安装器里的选择）。
  CreateDirectory "$APPDATA\NearSend"
  FileOpen $9 "$APPDATA\NearSend\installer.json" w
  ${If} $AutoStartState == "1"
    FileWrite $9 '{"autostart":true}'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "NearSend" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --hidden'
  ${Else}
    FileWrite $9 '{"autostart":false}'
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "NearSend"
  ${EndIf}
  FileClose $9
!macroend

; ---------------------------------------------------------------------------
; 卸载：移除自启动项
; ---------------------------------------------------------------------------
; 不定义 customRemoveFiles：沿用 electron-builder 的原子删除逻辑，
; 且它已经会在卸载前结束运行中的实例（见上面的 customCheckAppRunning）。
!macro customUnInstall
  ; 覆盖升级时不要动自启动项：安装器紧接着会按用户选择重写它。
  ${IfNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "NearSend"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LanDrop"
    ; 卸载器把工作目录设在 $INSTDIR，进程没退出时删不掉目录本身，
    ; 会留下一个空文件夹。先切到 TEMP 再删，卸载完就真的干净了。
    SetOutPath "$TEMP"
    RMDir "$INSTDIR"
  ${EndIf}
!macroend
