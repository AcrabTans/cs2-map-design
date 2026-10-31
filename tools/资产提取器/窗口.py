import os,sys,threading,subprocess,queue,json
from pathlib import Path
import tkinter as tk
from tkinter import ttk,filedialog,messagebox
ROOT=Path(__file__).parent
root=tk.Tk();root.title('天际线Ⅱ · 本地建筑资产提取器');root.geometry('790x540');root.minsize(650,430)
source=tk.StringVar();dest=tk.StringVar(value=str(ROOT/'output'));label=tk.StringVar();q=queue.Queue();busy=False
frame=ttk.Frame(root,padding=16);frame.pack(fill='both',expand=True);frame.columnconfigure(1,weight=1)
def choose():
 p=filedialog.askopenfilename(title='选择资产资源包',filetypes=[('COK 资源包','*.cok')])
 if p:source.set(p);label.set(Path(p).stem.removeprefix('Blob_'))
for row,title,var in [(0,'资源包',source),(1,'资产包名称',label),(2,'输出目录',dest)]:
 ttk.Label(frame,text=title).grid(row=row,column=0,sticky='w',pady=6);ttk.Entry(frame,textvariable=var).grid(row=row,column=1,sticky='ew',padx=8)
ttk.Button(frame,text='选择文件',command=choose).grid(row=0,column=2)
ttk.Button(frame,text='选择目录',command=lambda:dest.set(filedialog.askdirectory() or dest.get())).grid(row=2,column=2)
ttk.Label(frame,text='全程本地运行，不调用 AI。游戏目录只读；自动校验原文件。',wraplength=730).grid(row=3,column=0,columnspan=3,sticky='w',pady=10)
text=tk.Text(frame,wrap='word',height=16,font=('Microsoft YaHei',10));text.grid(row=6,column=0,columnspan=3,sticky='nsew');frame.rowconfigure(6,weight=1)
formats={key:tk.BooleanVar(value=key=='projection') for key in ['projection','lod2','lod1']}
choices=ttk.Frame(frame);choices.grid(row=5,column=0,columnspan=3,sticky='w',pady=(0,8))
for key,title in [('projection','二维投影'),('lod2','远景 LOD2'),('lod1','中等 LOD1')]:ttk.Checkbutton(choices,text=title,variable=formats[key]).pack(side='left',padx=(0,20))

def worker(args):
 try:
  flags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
  p=subprocess.Popen([os.environ.get('CS2_PYTHON',sys.executable),str(ROOT/'提取.py'),*args],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace',env={**os.environ,'PYTHONIOENCODING':'utf-8'},creationflags=flags)
  for line in p.stdout:q.put(line)
  p.wait();q.put(None)
 except Exception as e:q.put(str(e)+'\n');q.put(None)
def start():
 global busy
 if busy:return
 if not source.get():messagebox.showinfo('选择文件','请先选择 .cok 文件');return
 selected=[key for key,var in formats.items() if var.get()]
 if not selected:messagebox.showinfo('导出内容','请至少勾选一种导出内容');return
 busy=True;button.config(state='disabled');text.delete('1.0','end');threading.Thread(target=worker,args=([source.get(),'--output',dest.get(),'--name',label.get() or Path(source.get()).stem,'--formats',*selected],),daemon=True).start()
def poll():
 global busy
 while not q.empty():
  line=q.get()
  if line is None:busy=False;button.config(state='normal');continue
  try:
   d=json.loads(line)
   if 'ok' in d:line=('完成：'+str(d['assets'])+' 个建筑定义\n'+'\n'.join(d.get('files',[d['library']])) if d['ok'] else '未导出：'+d['error'])+'\n原文件校验：'+('未改变' if d.get('sourceUnchanged') else '发生变化')+'\n日志：'+d.get('log','')+'\n'
  except:pass
  text.insert('end',line);text.see('end')
 root.after(150,poll)
button=ttk.Button(frame,text='开始提取',command=start);button.grid(row=4,column=0,columnspan=2,sticky='w',pady=(0,10))
ttk.Button(frame,text='打开输出目录',command=lambda:os.startfile(dest.get())).grid(row=4,column=2,pady=(0,10))
if '--self-test' in sys.argv:
 root.withdraw();root.update_idletasks();assert root.title() and button['text']=='开始提取';root.destroy();print('GUI self-test OK')
else:poll();root.mainloop()
