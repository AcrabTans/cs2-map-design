from pathlib import Path
import runpy, traceback
root = Path(__file__).resolve().parent
try:
    runpy.run_path(str(root / "\u7a97\u53e3.py"), run_name="__main__")
except Exception:
    log = root / "startup-error.log"
    log.write_text(traceback.format_exc(), encoding="utf-8")
    import ctypes
    ctypes.windll.user32.MessageBoxW(0, "启动失败，详情已写入：\n" + str(log), "资产提取器", 16)
    raise
