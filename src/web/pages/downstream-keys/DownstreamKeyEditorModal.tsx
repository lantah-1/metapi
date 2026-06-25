import React, { useEffect, useState } from 'react';
import CenteredModal from '../../components/CenteredModal.js';
import { generateDownstreamSkKey } from '../helpers/generateDownstreamSkKey.js';

const PROXY_TOKEN_PREFIX = 'sk-';

export type DownstreamKeyEditorForm = {
  name: string;
  key: string;
  description: string;
  groupName: string;
  tags: string[];
  maxCost: string;
  maxRequests: string;
  expiresAt: string;
  enabled: boolean;
};

function parseTagText(value: string): string[] {
  return value
    .split(/[\r\n,，]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTags(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const normalized = value.slice(0, 32);
    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(normalized);
    if (result.length >= 20) break;
  }
  return result;
}

function tagChipStyle(kind: 'normal' | 'accent' = 'normal'): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    border: '1px solid var(--color-border-light)',
    color: kind === 'accent' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
    background: kind === 'accent'
      ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)'
      : 'var(--color-bg-card)',
  };
}

export function TagInput({
  tags,
  onChange,
  suggestions = [],
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft('');
  }, [tags.length]);

  const commitDraft = () => {
    const nextTags = normalizeTags([...tags, ...parseTagText(draft)]);
    if (nextTags.length !== tags.length) {
      onChange(nextTags);
    }
    setDraft('');
  };

  const removeTag = (target: string) => {
    onChange(tags.filter((tag) => tag !== target));
  };

  const suggestionPool = suggestions
    .filter((tag) => !tags.some((current) => current.toLowerCase() === tag.toLowerCase()))
    .slice(0, 12);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => removeTag(tag)}
              style={{ ...tagChipStyle('accent'), cursor: 'pointer' }}
              title={`移除 ${tag}`}
            >
              <span>{tag}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              commitDraft();
            } else if (event.key === 'Backspace' && !draft && tags.length > 0) {
              event.preventDefault();
              onChange(tags.slice(0, -1));
            }
          }}
          placeholder={placeholder || '输入标签后按回车或逗号'}
          style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'var(--color-text-primary)', padding: 0, fontSize: 13, lineHeight: 1.45 }}
        />
      </div>
      {suggestionPool.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {suggestionPool.map((tag) => (
            <button
              key={tag}
              type="button"
              className="btn btn-ghost"
              style={{ ...tagChipStyle(), cursor: 'pointer' }}
              onClick={() => onChange(normalizeTags([...tags, tag]))}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function DownstreamKeyEditorModal({
  open,
  editingItem,
  form,
  onChange,
  onClose,
  onSave,
  saving,
  groupSuggestions,
  tagSuggestions,
}: {
  open: boolean;
  editingItem: { id: number } | null;
  form: DownstreamKeyEditorForm;
  onChange: (updater: (prev: DownstreamKeyEditorForm) => DownstreamKeyEditorForm) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  groupSuggestions: string[];
  tagSuggestions: string[];
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-bg)',
    color: 'var(--color-text-primary)',
    fontSize: 13,
    lineHeight: 1.45,
  };

  return (
    <CenteredModal
      open={open}
      onClose={onClose}
      title={editingItem ? '编辑下游密钥' : '新增下游密钥'}
      maxWidth={720}
      bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      footer={(
        <>
          <button onClick={onClose} className="btn btn-ghost" disabled={saving}>取消</button>
          <button onClick={onSave} className="btn btn-primary" disabled={saving}>
            {saving
              ? <><span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> 保存中...</>
              : (editingItem ? '保存修改' : '创建密钥')}
          </button>
        </>
      )}
    >
      <div className="info-tip" style={{ marginBottom: 0 }}>
        下游密钥只配置身份、归类、额度与有效期；模型可用性请在路由分组中维护。
      </div>

      <div className="downstream-key-modal-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="downstream-key-modal-field downstream-key-modal-field-full">
          <div className="downstream-key-modal-label">名称</div>
          <input value={form.name} onChange={(event) => onChange((prev) => ({ ...prev, name: event.target.value }))} placeholder="例如：项目 A / 移动端" style={inputStyle} />
        </div>
        <div className="downstream-key-modal-field">
          <div className="downstream-key-modal-label">下游密钥</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minWidth: 0 }}>
            <input
              value={form.key}
              onChange={(event) => onChange((prev) => ({ ...prev, key: event.target.value }))}
              placeholder="sk-..."
              style={{ ...inputStyle, flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)' }}
            />
            <button
              type="button"
              className="btn btn-ghost"
              style={{ flexShrink: 0, whiteSpace: 'nowrap', alignSelf: 'stretch' }}
              onClick={() => onChange((prev) => ({ ...prev, key: generateDownstreamSkKey(PROXY_TOKEN_PREFIX) }))}
            >
              随机
            </button>
          </div>
        </div>
        <div className="downstream-key-modal-field">
          <div className="downstream-key-modal-label">主分组</div>
          <input
            value={form.groupName}
            onChange={(event) => onChange((prev) => ({ ...prev, groupName: event.target.value }))}
            placeholder="例如：VIP / 内部项目 / A组"
            list="downstream-group-suggestions"
            style={inputStyle}
          />
        </div>
        <div className="downstream-key-modal-field">
          <div className="downstream-key-modal-label">请求额度</div>
          <input value={form.maxRequests} onChange={(event) => onChange((prev) => ({ ...prev, maxRequests: event.target.value }))} placeholder="留空表示不限" style={inputStyle} />
        </div>
        <div className="downstream-key-modal-field">
          <div className="downstream-key-modal-label">成本额度</div>
          <input value={form.maxCost} onChange={(event) => onChange((prev) => ({ ...prev, maxCost: event.target.value }))} placeholder="留空表示不限" style={inputStyle} />
        </div>
        <div className="downstream-key-modal-field">
          <div className="downstream-key-modal-label">过期时间</div>
          <input type="datetime-local" value={form.expiresAt} onChange={(event) => onChange((prev) => ({ ...prev, expiresAt: event.target.value }))} style={inputStyle} />
        </div>
        <label className="downstream-key-modal-toggle">
          <input type="checkbox" checked={form.enabled} onChange={(event) => onChange((prev) => ({ ...prev, enabled: event.target.checked }))} />
          <div>
            <div className="downstream-key-modal-toggle-title">启用密钥</div>
            <div className="downstream-key-modal-help">关闭后该密钥无法继续分发请求</div>
          </div>
        </label>
      </div>

      <div className="downstream-key-modal-field downstream-key-modal-field-full">
        <div className="downstream-key-modal-label">备注说明</div>
        <textarea
          value={form.description}
          onChange={(event) => onChange((prev) => ({ ...prev, description: event.target.value }))}
          placeholder="填写业务场景、负责人或说明"
          style={{ ...inputStyle, minHeight: 84, resize: 'vertical' }}
        />
      </div>

      <div className="downstream-key-modal-field downstream-key-modal-field-full">
        <div className="downstream-key-modal-label">标签</div>
        <TagInput
          tags={form.tags}
          onChange={(tags) => onChange((prev) => ({ ...prev, tags }))}
          suggestions={tagSuggestions}
          placeholder="输入标签后按回车或逗号，例如：移动端、VIP、项目A"
        />
        <div className="downstream-key-modal-help">标签用于搜索、筛选和辅助归类，不影响路由与权限。</div>
      </div>

      <datalist id="downstream-group-suggestions">
        {groupSuggestions.map((group) => <option key={group} value={group} />)}
      </datalist>
    </CenteredModal>
  );
}
