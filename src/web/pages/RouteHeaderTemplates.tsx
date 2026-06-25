import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.js';
import {
  emptyCustomHeaderField,
  parseCustomHeadersForEditor,
  serializeCustomHeaders,
  type CustomHeaderField,
} from './helpers/customHeaders.js';
import type { RouteHeaderTemplate } from './token-routes/types.js';

type TemplateForm = {
  name: string;
  description: string;
  headers: CustomHeaderField[];
};

const EMPTY_FORM: TemplateForm = {
  name: '',
  description: '',
  headers: [emptyCustomHeaderField()],
};

function countHeaderFields(fields: CustomHeaderField[]): number {
  return fields.filter((field) => field.key.trim().length > 0 || field.value.trim().length > 0).length;
}

function buildForm(template?: RouteHeaderTemplate | null): TemplateForm {
  if (!template) return EMPTY_FORM;
  return {
    name: template.name || '',
    description: template.description || '',
    headers: parseCustomHeadersForEditor(template.headers),
  };
}

function collectHeadersText(template: RouteHeaderTemplate): string {
  return parseCustomHeadersForEditor(template.headers)
    .filter((field) => field.key.trim())
    .map((field) => field.key.trim())
    .join(' ');
}

export default function RouteHeaderTemplates() {
  const toast = useToast();
  const [templates, setTemplates] = useState<RouteHeaderTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const mountedRef = useRef(true);

  const load = async () => {
    const rows = await api.getRouteHeaderTemplates();
    if (!mountedRef.current) return;
    setTemplates((rows || []) as RouteHeaderTemplate[]);
  };

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      try {
        setLoading(true);
        await load();
      } catch (error: any) {
        toast.error(error?.message || '加载 Header 模板失败');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, [toast]);

  const templateById = useMemo(() => {
    const map = new Map<number, RouteHeaderTemplate>();
    for (const template of templates) map.set(template.id, template);
    return map;
  }, [templates]);
  const editingTemplate = editingId ? templateById.get(editingId) || null : null;

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sorted = [...templates].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
    if (!query) return sorted;
    return sorted.filter((template) => [
      template.name,
      template.description || '',
      collectHeadersText(template),
    ].join(' ').toLowerCase().includes(query));
  }, [search, templates]);

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (template: RouteHeaderTemplate) => {
    setEditingId(template.id);
    setForm(buildForm(template));
  };

  const updateHeaderField = (index: number, patch: Partial<CustomHeaderField>) => {
    setForm((prev) => ({
      ...prev,
      headers: prev.headers.map((field, fieldIndex) => (
        fieldIndex === index ? { ...field, ...patch } : field
      )),
    }));
  };

  const addHeaderField = () => {
    setForm((prev) => ({
      ...prev,
      headers: [...prev.headers, emptyCustomHeaderField()],
    }));
  };

  const removeHeaderField = (index: number) => {
    setForm((prev) => {
      const next = prev.headers.filter((_, fieldIndex) => fieldIndex !== index);
      return {
        ...prev,
        headers: next.length > 0 ? next : [emptyCustomHeaderField()],
      };
    });
  };

  const saveTemplate = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error('请填写模板名称');
      return;
    }
    const serialized = serializeCustomHeaders(form.headers);
    if (!serialized.valid) {
      toast.error(serialized.error || 'Header 配置不正确');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        description: form.description.trim() || null,
        headers: serialized.headersObject,
      };
      if (editingId) {
        await api.updateRouteHeaderTemplate(editingId, payload);
        toast.success('Header 模板已更新');
      } else {
        const created = await api.addRouteHeaderTemplate(payload);
        toast.success('Header 模板已创建');
        if (created?.id) setEditingId(Number(created.id));
      }
      await load();
      if (!editingId) setForm(EMPTY_FORM);
    } catch (error: any) {
      toast.error(error?.message || '保存 Header 模板失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (template: RouteHeaderTemplate) => {
    if (!globalThis.confirm(`确认删除 Header 模板 ${template.name}？已使用此模板的模型分组会改为不使用模板。`)) return;
    try {
      await api.deleteRouteHeaderTemplate(template.id);
      toast.success('Header 模板已删除');
      if (editingId === template.id) startCreate();
      await load();
    } catch (error: any) {
      toast.error(error?.message || '删除 Header 模板失败');
    }
  };

  const canSave = !!form.name.trim() && !saving;

  return (
    <div className="header-templates-page">
      <div className="page-header header-templates-header">
        <div>
          <h1 className="page-title">自定义 Header 模板</h1>
          <p className="page-subtitle">为模型分组复用一组上游请求 Header。</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={startCreate}>新建模板</button>
        </div>
      </div>

      <div className="header-templates-layout">
        <section className="header-templates-list" aria-label="Header 模板列表">
          <div className="header-templates-search">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索模板或 Header"
            />
          </div>

          {loading ? (
            <div className="empty-state">
              <div className="empty-state-title">正在加载 Header 模板</div>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="header-templates-empty">
              <div className="empty-state-title">还没有 Header 模板</div>
              <button type="button" className="btn btn-primary" onClick={startCreate}>新建模板</button>
            </div>
          ) : filteredTemplates.map((template) => {
            const headers = parseCustomHeadersForEditor(template.headers).filter((field) => field.key.trim());
            const selected = template.id === editingId;
            return (
              <article key={template.id} className={`header-template-card ${selected ? 'is-selected' : ''}`.trim()}>
                <button type="button" className="header-template-card-main" onClick={() => startEdit(template)}>
                  <span className="header-template-card-title">{template.name}</span>
                  <span className="header-template-card-meta">
                    {headers.length} 个 Header
                    {template.description ? ` / ${template.description}` : ''}
                  </span>
                </button>
                <div className="header-template-chip-row">
                  {headers.slice(0, 5).map((field) => (
                    <span key={field.key} className="header-template-chip">{field.key}</span>
                  ))}
                  {headers.length > 5 && <span className="header-template-chip is-muted">+{headers.length - 5}</span>}
                </div>
                <div className="header-template-card-actions">
                  <button type="button" className="btn-link" onClick={() => startEdit(template)}>编辑</button>
                  <button type="button" className="btn-link btn-link-danger" onClick={() => deleteTemplate(template)}>删除</button>
                </div>
              </article>
            );
          })}
        </section>

        <aside className="header-template-editor" aria-label="Header 模板编辑">
          <div className="header-template-editor-header">
            <div>
              <h2>{editingTemplate ? '编辑模板' : '新建模板'}</h2>
              <p>{editingTemplate ? editingTemplate.name : '创建可复用 Header 配置'}</p>
            </div>
            {editingTemplate && <button type="button" className="btn-link" onClick={startCreate}>新建</button>}
          </div>

          <div className="header-template-form">
            <label className="header-template-field">
              <span className="header-template-field-label">模板名称</span>
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="例如 Codex GPT Header"
              />
            </label>

            <label className="header-template-field">
              <span className="header-template-field-label">描述</span>
              <input
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="可选"
              />
            </label>

            <div className="header-template-field">
              <div className="header-template-toolbar">
                <span className="header-template-field-label">Header</span>
                <button type="button" className="btn-link" onClick={addHeaderField}>添加</button>
              </div>
              <div className="header-template-header-list">
                {form.headers.map((field, index) => (
                  <div key={index} className="header-template-header-row">
                    <input
                      value={field.key}
                      onChange={(event) => updateHeaderField(index, { key: event.target.value })}
                      placeholder="Header 名称"
                    />
                    <input
                      value={field.value}
                      onChange={(event) => updateHeaderField(index, { value: event.target.value })}
                      placeholder="Header 值"
                    />
                    <button type="button" className="btn-link btn-link-danger" onClick={() => removeHeaderField(index)}>删除</button>
                  </div>
                ))}
              </div>
              <div className="header-template-field-hint">{countHeaderFields(form.headers)} 个 Header</div>
            </div>

            <div className="header-template-form-actions">
              <button type="button" className="btn btn-primary" onClick={saveTemplate} disabled={!canSave}>
                {saving ? '保存中...' : (editingTemplate ? '保存模板' : '创建模板')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={startCreate}>重置</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
