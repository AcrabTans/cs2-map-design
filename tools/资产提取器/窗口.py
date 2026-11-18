import json
import os
import queue
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

ROOT = Path(__file__).resolve().parent


def default_mod_directory():
    local_low = Path.home() / 'AppData' / 'LocalLow'
    cache = local_low / 'Colossal Order' / 'Cities Skylines II' / '.cache' / 'Mods' / 'pdx_mods'
    return cache if cache.is_dir() else Path.home()


def tool_lines(command):
    env = dict(os.environ, PYTHONIOENCODING='utf-8')
    with subprocess.Popen(command, cwd=ROOT, env=env, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, text=True, encoding='utf-8',
                          errors='replace', creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)) as proc:
        yield from proc.stdout
        if proc.wait():
            raise RuntimeError(f'工具退出，错误代码 {proc.returncode}')


class ExtractorWindow:
    def __init__(self, root):
        self.root = root
        root.title('天际线Ⅱ · 本地资产提取器')
        root.geometry('1020x740')
        root.minsize(770, 600)
        root.protocol('WM_DELETE_WINDOW', self.close)
        self.events = queue.Queue()
        self.task = None
        self.rows = {}
        self.checked = set()
        self.scan_folder = default_mod_directory()
        self.destination = tk.StringVar(value=str(ROOT / 'output'))
        self.search = tk.StringVar()
        self.category = tk.StringVar(value='全部')
        self.name = tk.StringVar()
        self.count = tk.StringVar()
        self.status = tk.StringVar(value='选择 Mod 文件夹进行扫描，或直接选择单个 .cok。')
        self.formats = {kind: tk.BooleanVar(value=kind == 'projection')
                        for kind in ('projection', 'lod2', 'lod1')}

        body = ttk.Frame(root, padding=12)
        body.pack(fill='both', expand=True)
        body.columnconfigure(0, weight=1)
        body.rowconfigure(3, weight=3)
        body.rowconfigure(5, weight=2)

        source_bar = ttk.Frame(body)
        source_bar.grid(row=0, column=0, sticky='ew')
        self.scan_button = ttk.Button(source_bar, text='扫描 Mod 文件夹', command=self.choose_scan)
        self.scan_button.pack(side='left')
        self.file_button = ttk.Button(source_bar, text='选择单个 .cok', command=self.choose_file)
        self.file_button.pack(side='left', padx=8)
        ttk.Label(source_bar, textvariable=self.status).pack(side='left')

        output_bar = ttk.Frame(body)
        output_bar.grid(row=1, column=0, sticky='ew', pady=(8, 0))
        ttk.Label(output_bar, text='输出目录').pack(side='left')
        self.output_entry = ttk.Entry(output_bar, textvariable=self.destination)
        self.output_entry.pack(side='left', fill='x', expand=True, padx=8)
        self.output_button = ttk.Button(output_bar, text='选择目录', command=self.choose_output)
        self.output_button.pack(side='left')

        filters = ttk.Frame(body)
        filters.grid(row=2, column=0, sticky='ew', pady=(8, 6))
        ttk.Label(filters, text='搜索名称 / Mod 编号').pack(side='left')
        ttk.Entry(filters, textvariable=self.search, width=25).pack(side='left', padx=(6, 8))
        chooser = ttk.Combobox(filters, textvariable=self.category, state='readonly', width=12,
                               values=('全部', '建筑资产', '含主模型的建筑包', '其他资产', '代码 Mod', '其他 / 读取失败'))
        chooser.pack(side='left')
        self.all_button = ttk.Button(filters, text='勾选当前结果', command=self.check_visible)
        self.all_button.pack(side='left', padx=6)
        self.clear_button = ttk.Button(filters, text='清空勾选', command=self.clear_checks)
        self.clear_button.pack(side='left')
        ttk.Label(filters, textvariable=self.count).pack(side='right')

        list_frame = ttk.Frame(body)
        list_frame.grid(row=3, column=0, sticky='nsew')
        columns = ('pick', 'name', 'type', 'count', 'mod', 'size')
        self.tree = ttk.Treeview(list_frame, columns=columns, show='headings', selectmode='browse')
        for column, title, size in zip(columns, ('选', '名称', '类型', '建筑数', 'Mod / 版本', '包大小'),
                                       (42, 300, 175, 65, 145, 85)):
            self.tree.heading(column, text=title)
            self.tree.column(column, width=size, minwidth=40, stretch=column in ('name', 'type'),
                             anchor='w' if column in ('name', 'type', 'mod') else 'center')
        scroll = ttk.Scrollbar(list_frame, orient='vertical', command=self.tree.yview)
        horizontal = ttk.Scrollbar(list_frame, orient='horizontal', command=self.tree.xview)
        self.tree.configure(yscrollcommand=scroll.set, xscrollcommand=horizontal.set)
        scroll.pack(side='right', fill='y')
        horizontal.pack(side='bottom', fill='x')
        self.tree.pack(fill='both', expand=True)
        self.tree.bind('<Button-1>', self.tree_click)
        self.tree.bind('<space>', self.tree_space)
        self.tree.bind('<<TreeviewSelect>>', self.show_details)

        self.manual_name = ttk.Frame(body)
        ttk.Label(self.manual_name, text='资产包名称').pack(side='left')
        self.name_entry = ttk.Entry(self.manual_name, textvariable=self.name)
        self.name_entry.pack(side='left', fill='x', expand=True, padx=8)

        self.tabs = ttk.Notebook(body)
        self.tabs.grid(row=5, column=0, sticky='nsew', pady=(8, 0))
        self.detail = self.text_tab('包内资产')
        self.log = self.text_tab('提取日志')

        actions = ttk.Frame(body)
        actions.grid(row=6, column=0, sticky='ew', pady=(8, 0))
        self.format_buttons = []
        for key, title in [('projection', '二维投影'), ('lod2', '远景 LOD2'), ('lod1', '中等 LOD1')]:
            button = ttk.Checkbutton(actions, text=title, variable=self.formats[key])
            button.pack(side='left', padx=(0, 12))
            self.format_buttons.append(button)
            self.formats[key].trace_add('write', self.refresh_controls)
        self.start_button = ttk.Button(actions, text='提取所选资产包', command=self.start)
        self.start_button.pack(side='right')
        self.progress = ttk.Progressbar(actions, mode='determinate')
        self.progress.pack(side='right', fill='x', expand=True, padx=10)
        self.search.trace_add('write', self.render_rows)
        self.category.trace_add('write', self.render_rows)
        self.refresh_controls()
        root.after(80, self.poll)

    def text_tab(self, title):
        frame = ttk.Frame(self.tabs)
        self.tabs.add(frame, text=title)
        scroll = ttk.Scrollbar(frame, orient='vertical')
        text = tk.Text(frame, wrap='word', height=7, font=('Microsoft YaHei', 10),
                       state='disabled', yscrollcommand=scroll.set)
        scroll.configure(command=text.yview)
        scroll.pack(side='right', fill='y')
        text.pack(fill='both', expand=True)
        return text

    @staticmethod
    def set_text(widget, text, append=False):
        widget.configure(state='normal')
        if not append:
            widget.delete('1.0', 'end')
        widget.insert('end', text)
        if append:
            widget.see('end')
        widget.configure(state='disabled')

    def refresh_controls(self, *_):
        busy = self.task is not None
        for widget in (self.scan_button, self.file_button, self.output_button, self.output_entry,
                       self.name_entry, self.all_button, self.clear_button, *self.format_buttons):
            widget.configure(state='disabled' if busy else 'normal')
        self.start_button.configure(state='normal' if not busy and self.checked and
                                    any(var.get() for var in self.formats.values()) else 'disabled')
        self.count.set(f'{len(self.rows)} 条 · 已勾选 {len(self.checked)} 包')

    def reset_rows(self):
        self.rows.clear()
        self.checked.clear()
        self.search.set('')
        self.category.set('全部')
        self.manual_name.grid_remove()
        self.tabs.select(0)
        self.render_rows()

    def choose_scan(self):
        folder = filedialog.askdirectory(title='选择 pdx_mods 或其他 Mod 文件夹',
                                         initialdir=self.scan_folder)
        if not folder:
            return
        self.scan_folder = Path(folder)
        self.reset_rows()
        self.task = 'scan'
        self.status.set('正在读取 Mod 清单和包内定义…')
        self.progress.configure(mode='indeterminate')
        self.progress.start(12)
        self.refresh_controls()
        threading.Thread(target=self.scan, args=(folder,), daemon=True).start()

    def scan(self, folder):
        try:
            for line in tool_lines([os.environ.get('CS2_NODE', 'node'), str(ROOT / 'mod-catalog.mjs'), folder]):
                try:
                    row = json.loads(line)
                except ValueError:
                    self.events.put(('log', line))
                    continue
                self.events.put(('row', row))
        except (OSError, RuntimeError) as error:
            self.events.put(('error', f'扫描失败：{error}'))
        finally:
            self.events.put(('done-scan', None))

    def choose_file(self):
        file = filedialog.askopenfilename(title='选择资产资源包', filetypes=[('COK 资源包', '*.cok')])
        if not file:
            return
        self.reset_rows()
        source = Path(file)
        name = source.stem.removeprefix('Blob_')
        if source.name in ('Blob.cok', 'Prefabs.cok') and source.parent.parent.name == 'Content' and source.parent.name != 'Game':
            name = source.parent.name
        self.rows['0'] = dict(file=file, name=name, type='手动选择', count=None, mod='—', bytes=source.stat().st_size,
                              buildings=[], eligible=True, folder=str(source.parent))
        self.checked.add('0')
        self.name.set(name)
        self.manual_name.grid(row=4, column=0, sticky='ew')
        self.status.set('已选择一个资源包。')
        self.render_rows()
        self.tree.selection_set('0')

    def choose_output(self):
        folder = filedialog.askdirectory(title='选择输出文件夹')
        if folder:
            self.destination.set(folder)

    def matches(self, row, query, category):
        if category == '含主模型的建筑包' and not row['eligible']:
            return False
        if category == '建筑资产' and row['type'] != category:
            return False
        if category == '其他资产' and row['type'] not in ('其他资产', 'COK 资源'):
            return False
        if category == '代码 Mod' and not row.get('code'):
            return False
        if category == '其他 / 读取失败' and row['type'] not in ('其他 Mod', '读取失败'):
            return False
        return not query or any(query in item.casefold() for item in
                                (row['name'], row['mod'], Path(row.get('file', '')).name, *row['buildings'],
                                 *(asset['name'] for asset in row.get('assets', []))))

    def render_rows(self, *_):
        selected = self.tree.selection()
        children = self.tree.get_children()
        if children:
            self.tree.delete(*children)
        query, category = self.search.get().strip().casefold(), self.category.get()
        for key, row in self.rows.items():
            if not self.matches(row, query, category):
                continue
            marker = '☑' if key in self.checked else '☐' if row['eligible'] else '—'
            size = row.get('bytes')
            types = [row['type'], *row.get('types', [])]
            if row.get('code') and row['type'] != '代码 Mod':
                types.append('代码')
            count = '—' if row['count'] is None else str(row['count'])
            self.tree.insert('', 'end', iid=key, values=(marker, row['name'], ' · '.join(types), count, row['mod'],
                                                        f'{size / 1048576:.1f} MB' if size is not None else '—'))
        if selected and self.tree.exists(selected[0]):
            self.tree.selection_set(selected[0])
        self.refresh_controls()

    def toggle(self, key):
        if self.task or not key or not self.rows[key]['eligible']:
            return
        if key in self.checked:
            self.checked.remove(key)
        else:
            self.checked.add(key)
        self.tree.set(key, 'pick', '☑' if key in self.checked else '☐')
        self.refresh_controls()

    def tree_click(self, event):
        if self.tree.identify_region(event.x, event.y) == 'cell' and self.tree.identify_column(event.x) == '#1':
            self.toggle(self.tree.identify_row(event.y))

    def tree_space(self, _):
        selected = self.tree.selection()
        if selected:
            self.toggle(selected[0])
        return 'break'

    def check_visible(self):
        self.checked.update(key for key in self.tree.get_children() if self.rows[key]['eligible'])
        self.render_rows()

    def clear_checks(self):
        self.checked.clear()
        self.render_rows()

    def show_details(self, _):
        selected = self.tree.selection()
        if not selected:
            self.set_text(self.detail, '')
            return
        row = self.rows[selected[0]]
        summary = [row['name'], row.get('file') or row['folder']]
        if row.get('note'):
            summary.append(row['note'])
        if row['buildings']:
            summary += ['', '建筑', *row['buildings']]
        if row.get('assets'):
            summary += ['', '其他资产', *(f'{asset["type"]} · {asset["name"]}' for asset in row['assets'])]
        self.set_text(self.detail, '\n'.join(summary))

    def start(self):
        rows = [row for key, row in self.rows.items() if key in self.checked]
        selected = [kind for kind, flag in self.formats.items() if flag.get()]
        output = self.destination.get().strip()
        if not output:
            messagebox.showinfo('输出目录', '请选择输出目录。')
            return
        if not rows or not selected:
            return
        self.task = 'extract'
        self.refresh_controls()
        self.progress.configure(mode='determinate', maximum=len(rows), value=0)
        self.set_text(self.log, '')
        self.tabs.select(1)
        threading.Thread(target=self.extract, args=(rows, output, selected, self.name.get().strip()), daemon=True).start()

    def extract(self, rows, output, formats, manual_name):
        succeeded = 0
        python = Path(sys.executable)
        if python.name.lower() == 'pythonw.exe':
            python = python.with_name('python.exe')
        for i, row in enumerate(rows, 1):
            self.events.put(('status', f'提取中 {i}/{len(rows)} · {row["name"]}'))
            self.events.put(('log', f'\n[{i}/{len(rows)}] {row["name"]}\n'))
            args = [os.environ.get('CS2_PYTHON', str(python)), str(ROOT / '提取.py'), row['file'],
                    '--output', output, '--name', manual_name if row['type'] == '手动选择' and manual_name else row['name']]
            if row.get('packageId'):
                args.extend(['--package-id', row['packageId']])
            args.extend(['--formats', *formats])
            result = None
            try:
                for line in tool_lines(args):
                    try:
                        data = json.loads(line)
                    except ValueError:
                        data = None
                    if isinstance(data, dict) and 'ok' in data:
                        result = data
                    else:
                        self.events.put(('log', line))
            except (OSError, RuntimeError) as error:
                if result is None or result.get('ok'):
                    result = {'ok': False, 'error': str(error)}
            if result and result.get('ok'):
                succeeded += 1
                message = f'已导出 {result["assets"]} 栋建筑\n' + '\n'.join(result['files'])
            else:
                message = '未导出：' + (result.get('error', '无提取结果') if result else '无提取结果')
                if result and result.get('log'):
                    message += '\n日志：' + result['log']
            self.events.put(('log', message + '\n'))
            self.events.put(('progress', i))
        self.events.put(('done-extract', f'已导出 {succeeded}/{len(rows)} 包，请查看提取日志。'))

    def poll(self):
        refresh_rows = False
        while not self.events.empty():
            event, value = self.events.get()
            if event == 'row':
                self.rows[str(len(self.rows))] = value
                refresh_rows = True
            elif event == 'log':
                self.set_text(self.log, value, append=True)
            elif event == 'status':
                self.status.set(value)
            elif event == 'error':
                self.set_text(self.log, value + '\n', append=True)
                self.tabs.select(1)
                self.status.set(value)
            elif event == 'progress':
                self.progress.configure(value=value)
            elif event == 'done-scan':
                self.progress.stop()
                self.progress.configure(mode='determinate', maximum=1, value=0)
                if not self.status.get().startswith('扫描失败'):
                    ready = sum(row['eligible'] for row in self.rows.values())
                    self.status.set(f'扫描完成，{ready} 包含可供提取的建筑定义。')
                self.task = None
                self.refresh_controls()
            elif event == 'done-extract':
                self.status.set(value)
                self.task = None
                self.refresh_controls()
        if refresh_rows:
            self.render_rows()
        self.root.after(80, self.poll)

    def close(self):
        if not self.task:
            self.root.destroy()


if __name__ == '__main__':
    root = tk.Tk()
    window = ExtractorWindow(root)
    if '--self-test' in sys.argv:
        root.withdraw()
        root.update_idletasks()
        assert window.start_button.instate(['disabled'])
        row = dict(name='测试建筑包', type='建筑资产', mod='123 / 版本 2', count=1,
                   buildings=['测试建筑'], eligible=True, folder='.')
        window.rows.update({'0': row, '1': {**row, 'name': '工具', 'type': '代码 Mod', 'code': True, 'count': None, 'eligible': False}})
        window.render_rows()
        window.check_visible()
        assert window.checked == {'0'}
        window.category.set('代码 Mod')
        assert window.tree.get_children() == ('1',)
        assert window.checked == {'0'}
        root.destroy()
        print('GUI self-test OK')
    else:
        root.mainloop()
