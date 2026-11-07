; 打开安装包时检查已安装版本：
;   未安装        -> 直接安装
;   已安装且更旧  -> 询问是否更新
;   已安装且更新  -> 询问是否降级
;   静默安装 (/S) 不弹窗，避免自动化流程卡住

!include "LogicLib.nsh"
!include "WordFunc.nsh"

!macro customInit
  ${IfNot} ${Silent}
    ReadRegStr $R9 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ${If} $R9 != ""
      ${VersionCompare} "$R9" "${VERSION}" $R8
      ${If} $R8 == 1
        MessageBox MB_YESNO|MB_ICONQUESTION "检测到已安装 $R9，将更新到 ${VERSION}。$\r$\n$\r$\n是否继续安装？" IDYES ld_upgrade_ok
        Abort
        ld_upgrade_ok:
      ${ElseIf} $R8 == 2
        MessageBox MB_YESNO|MB_ICONEXCLAMATION "当前已安装 $R9，高于此安装包 ${VERSION}。$\r$\n$\r$\n是否降级安装？" IDYES ld_downgrade_ok
        Abort
        ld_downgrade_ok:
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
