import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ToastProvider } from '../components/Toast.js';
import TokenRoutes from './TokenRoutes.js';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getRoutesSummary: vi.fn(),
    addRoute: vi.fn(),
    updateRoute: vi.fn(),
    deleteRoute: vi.fn(),
    rebuildRoutes: vi.fn(),
    getRouteHeaderTemplates: vi.fn(),
  },
}));

vi.mock('../api.js', () => ({
  api: apiMock,
}));

vi.mock('../components/BrandIcon.js', () => ({
  BrandGlyph: ({ model, fallbackText }: { model?: string | null; fallbackText?: string | null }) => (
    <span>{model || fallbackText || ''}</span>
  ),
  getBrand: () => null,
}));

type TestRenderer = ReturnType<typeof create>;

const exactOpenAi = {
  id: 11,
  modelPattern: 'openai/gpt-5.5',
  displayName: null,
  displayIcon: null,
  routeMode: 'pattern',
  sourceRouteIds: [],
  modelMapping: null,
  customHeaderTemplateId: null,
  customHeaders: null,
  routingStrategy: 'weighted',
  enabled: true,
  channelCount: 1,
  enabledChannelCount: 1,
  siteNames: ['OpenAI'],
  siteStatuses: [{ id: 101, name: 'OpenAI', status: 'active' }],
  decisionSnapshot: null,
  decisionRefreshedAt: null,
};

const exactAzure = {
  id: 12,
  modelPattern: 'azure/gpt-5.5',
  displayName: null,
  displayIcon: null,
  routeMode: 'pattern',
  sourceRouteIds: [],
  modelMapping: null,
  customHeaderTemplateId: null,
  customHeaders: null,
  routingStrategy: 'weighted',
  enabled: true,
  channelCount: 1,
  enabledChannelCount: 1,
  siteNames: ['Azure'],
  siteStatuses: [{ id: 102, name: 'Azure', status: 'active' }],
  decisionSnapshot: null,
  decisionRefreshedAt: null,
};

const exactClaude = {
  id: 13,
  modelPattern: 'claude-sonnet-4-5',
  displayName: null,
  displayIcon: null,
  routeMode: 'pattern',
  sourceRouteIds: [],
  modelMapping: null,
  customHeaderTemplateId: null,
  customHeaders: null,
  routingStrategy: 'weighted',
  enabled: true,
  channelCount: 1,
  enabledChannelCount: 1,
  siteNames: ['Anthropic'],
  siteStatuses: [{ id: 103, name: 'Anthropic', status: 'active' }],
  decisionSnapshot: null,
  decisionRefreshedAt: null,
};

const groupGpt = {
  id: 21,
  modelPattern: 'gpt-5.5',
  displayName: 'gpt-5.5',
  displayIcon: null,
  routeMode: 'explicit_group',
  sourceRouteIds: [11, 12],
  modelMapping: null,
  customHeaderTemplateId: 31,
  customHeaders: '{"x-group":"gpt"}',
  routingStrategy: 'stable_first',
  enabled: true,
  channelCount: 2,
  enabledChannelCount: 2,
  siteNames: ['OpenAI', 'Azure'],
  siteStatuses: [
    { id: 101, name: 'OpenAI', status: 'active' },
    { id: 102, name: 'Azure', status: 'active' },
  ],
  decisionSnapshot: null,
  decisionRefreshedAt: null,
};

const switchCustom = {
  id: 22,
  modelPattern: 'custom',
  displayName: 'custom',
  displayIcon: null,
  routeMode: 'switch_group',
  sourceRouteIds: [21, 13],
  activeSourceRouteId: 21,
  modelMapping: '{"activeSourceRouteId":21}',
  customHeaderTemplateId: null,
  customHeaders: null,
  routingStrategy: 'stable_first',
  enabled: true,
  channelCount: 2,
  enabledChannelCount: 2,
  siteNames: ['OpenAI', 'Azure', 'Anthropic'],
  siteStatuses: [
    { id: 101, name: 'OpenAI', status: 'active' },
    { id: 102, name: 'Azure', status: 'active' },
    { id: 103, name: 'Anthropic', status: 'active' },
  ],
  decisionSnapshot: null,
  decisionRefreshedAt: null,
};

function collectText(node: ReactTestInstance): string {
  return (node.children || []).map((child) => {
    if (typeof child === 'string') return child;
    return collectText(child);
  }).join('');
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function findButtonByText(root: ReactTestInstance, text: string): ReactTestInstance {
  return root.find((node) => (
    node.type === 'button'
    && collectText(node).includes(text)
  ));
}

function findButtonByExactText(root: ReactTestInstance, text: string): ReactTestInstance {
  return root.find((node) => (
    node.type === 'button'
    && collectText(node).trim() === text
  ));
}

function findGroupMainByText(root: ReactTestInstance, text: string): ReactTestInstance {
  return root.find((node) => (
    node.type === 'button'
    && node.props.className === 'model-group-card-main'
    && collectText(node).includes(text)
  ));
}

function findGroupCardByText(root: ReactTestInstance, text: string): ReactTestInstance {
  return root.find((node) => (
    node.type === 'article'
    && typeof node.props.className === 'string'
    && node.props.className.includes('model-group-card')
    && collectText(node).includes(text)
  ));
}

function findDetailPanel(root: ReactTestInstance): ReactTestInstance {
  return root.find((node) => node.props.className === 'model-group-detail');
}

function findDetailPanelByClassPart(root: ReactTestInstance, classPart: string): ReactTestInstance {
  return root.find((node) => (
    typeof node.props.className === 'string'
    && node.props.className.includes('model-group-detail')
    && node.props.className.includes(classPart)
  ));
}

function findQuickSwitch(root: ReactTestInstance, routeId: number): ReactTestInstance {
  return root.find((node) => node.props['data-testid'] === `model-group-quick-switch-${routeId}`);
}

function findModernSelectOption(root: ReactTestInstance, text: string): ReactTestInstance {
  return root.find((node) => (
    node.type === 'button'
    && typeof node.props.className === 'string'
    && node.props.className.includes('modern-select-option')
    && collectText(node).includes(text)
  ));
}

function findInputByPlaceholder(root: ReactTestInstance, placeholder: string): ReactTestInstance {
  return root.find((node) => (
    node.type === 'input'
    && node.props.placeholder === placeholder
  ));
}

function findSourceRowByText(root: ReactTestInstance, text: string): ReactTestInstance {
  return root.find((node) => (
    node.type === 'label'
    && typeof node.props.className === 'string'
    && node.props.className.includes('model-group-source-row')
    && collectText(node).includes(text)
  ));
}

function findSourceRowByTextParts(root: ReactTestInstance, parts: string[]): ReactTestInstance {
  return root.find((node) => (
    node.type === 'label'
    && typeof node.props.className === 'string'
    && node.props.className.includes('model-group-source-row')
    && parts.every((part) => collectText(node).includes(part))
  ));
}

async function renderPage(): Promise<TestRenderer> {
  let root!: TestRenderer;
  await act(async () => {
    root = create(
      <ToastProvider>
        <TokenRoutes />
      </ToastProvider>,
    );
  });
  await flushMicrotasks();
  return root;
}

describe('TokenRoutes model groups page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
    apiMock.getRoutesSummary.mockResolvedValue([
      exactOpenAi,
      exactAzure,
      exactClaude,
      groupGpt,
    ]);
    apiMock.addRoute.mockResolvedValue({});
    apiMock.updateRoute.mockResolvedValue({});
    apiMock.deleteRoute.mockResolvedValue({});
    apiMock.rebuildRoutes.mockResolvedValue({ queued: true, message: '已开始同步供应商模型' });
    apiMock.getRouteHeaderTemplates.mockResolvedValue([
      {
        id: 31,
        name: 'Codex Header',
        description: 'GPT',
        headers: '{"x-template":"codex"}',
      },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders explicit groups as the primary route page surface', async () => {
    const root = await renderPage();
    try {
      const text = collectText(root.root);
      expect(text).toContain('模型分组');
      expect(text).toContain('gpt-5.5');
      expect(text).toContain('稳定优先');
      expect(text).toContain('openai/gpt-5.5');
      expect(text).toContain('azure/gpt-5.5');
      expect(text).not.toContain('OAuth 路由池');
      expect(text).not.toContain('路由选中概率');
    } finally {
      root.unmount();
    }
  });

  it('opens the group editor as a modal only when editing', async () => {
    const root = await renderPage();
    try {
      expect(root.root.findAll((node) => node.props.role === 'dialog')).toHaveLength(0);

      await act(async () => {
        findButtonByText(root.root, '编辑').props.onClick();
      });

      const dialogs = root.root.findAll((node) => node.props.role === 'dialog');
      expect(dialogs).toHaveLength(1);
      expect(collectText(dialogs[0])).toContain('编辑分组');
      expect(collectText(dialogs[0])).toContain('gpt-5.5');

      await act(async () => {
        findButtonByText(dialogs[0], '取消').props.onClick();
      });

      expect(root.root.findAll((node) => node.props.role === 'dialog')).toHaveLength(0);
    } finally {
      root.unmount();
    }
  });

  it('separates switch groups from normal groups in the left list', async () => {
    apiMock.getRoutesSummary.mockResolvedValue([
      exactOpenAi,
      exactAzure,
      exactClaude,
      groupGpt,
      { ...switchCustom, sourceRouteIds: [13, 21] },
    ]);

    const root = await renderPage();
    try {
      const sections = root.root.findAll((node) => (
        node.type === 'section'
        && typeof node.props.className === 'string'
        && node.props.className.includes('model-groups-list-section')
      ));
      expect(sections).toHaveLength(2);
      expect(collectText(sections[0])).toContain('切换分组');
      expect(collectText(sections[0])).toContain('custom');
      expect(collectText(sections[0])).not.toContain('gpt-5.5普通分组');
      expect(collectText(sections[1])).toContain('普通分组');
      expect(collectText(sections[1])).toContain('gpt-5.5');
      expect(collectText(sections[1])).not.toContain('custom');
    } finally {
      root.unmount();
    }
  });

  it('shows only the current target when expanding a switch group and updates it from the dropdown', async () => {
    apiMock.getRoutesSummary.mockResolvedValue([
      exactOpenAi,
      exactAzure,
      exactClaude,
      groupGpt,
      switchCustom,
    ]);

    const root = await renderPage();
    try {
      await act(async () => {
        findGroupMainByText(root.root, 'custom').props.onClick();
      });

      const detail = findDetailPanelByClassPart(root.root, 'is-switch-quick');
      expect(collectText(detail)).toContain('当前使用');
      expect(detail.findAll((node) => node.props.className === 'model-group-detail-list')).toHaveLength(0);
      const currentTarget = detail.find((node) => node.props.className === 'model-group-current-target');
      expect(collectText(currentTarget)).toContain('gpt-5.5');
      expect(collectText(currentTarget)).not.toContain('claude-sonnet-4-5');

      const quickSwitch = findQuickSwitch(root.root, 22);
      const quickSwitchOptions = quickSwitch.findAll((node) => (
        node.type === 'button'
        && typeof node.props.className === 'string'
        && node.props.className.includes('modern-select-option')
      ));
      expect(collectText(quickSwitchOptions[0])).toContain('gpt-5.5');
      expect(collectText(quickSwitchOptions[1])).toContain('claude-sonnet-4-5');
      const groupOption = findModernSelectOption(quickSwitch, 'gpt-5.5');
      expect(collectText(groupOption)).toContain('分组');
      expect(collectText(groupOption)).toContain('普通分组');
      expect(collectText(groupOption)).toContain('OpenAI、Azure');
      const singleModelOption = findModernSelectOption(quickSwitch, 'claude-sonnet-4-5');
      expect(collectText(singleModelOption)).toContain('单模');
      expect(collectText(singleModelOption)).toContain('供应商单模型');
      expect(collectText(singleModelOption)).toContain('Anthropic');

      await act(async () => {
        singleModelOption.props.onClick();
      });
      await flushMicrotasks();

      expect(apiMock.updateRoute).toHaveBeenCalledWith(22, { activeSourceRouteId: 13 });
    } finally {
      root.unmount();
    }
  });

  it('expands a group card to show member suppliers', async () => {
    const root = await renderPage();
    try {
      expect(root.root.findAll((node) => node.props.className === 'model-group-detail')).toHaveLength(0);

      await act(async () => {
        findGroupMainByText(root.root, 'gpt-5.5').props.onClick();
      });

      const detailText = collectText(findDetailPanel(root.root));
      expect(detailText).toContain('成员明细');
      expect(detailText).toContain('openai/gpt-5.5');
      expect(detailText).toContain('OpenAI');
      expect(detailText).toContain('azure/gpt-5.5');
      expect(detailText).toContain('Azure');
    } finally {
      root.unmount();
    }
  });

  it('keeps disabled suppliers visible but renders them muted', async () => {
    apiMock.getRoutesSummary.mockResolvedValue([
      exactOpenAi,
      {
        ...exactAzure,
        enabledChannelCount: 0,
        siteStatuses: [{ id: 102, name: 'Azure', status: 'disabled' }],
      },
      exactClaude,
      {
        ...groupGpt,
        enabledChannelCount: 1,
        siteStatuses: [
          { id: 101, name: 'OpenAI', status: 'active' },
          { id: 102, name: 'Azure', status: 'disabled' },
        ],
      },
    ]);

    const root = await renderPage();
    try {
      await act(async () => {
        findGroupMainByText(root.root, 'gpt-5.5').props.onClick();
      });

      const azureChip = root.root.find((node) => (
        node.type === 'span'
        && typeof node.props.className === 'string'
        && node.props.className.includes('model-group-supplier-chip')
        && collectText(node) === 'Azure'
      ));
      expect(azureChip.props.className).toContain('is-disabled');
      expect(azureChip.props.title).toBe('Azure 已禁用');
    } finally {
      root.unmount();
    }
  });

  it('expands from the member chip area, not only the title row', async () => {
    const root = await renderPage();
    try {
      const card = findGroupCardByText(root.root, 'openai/gpt-5.5');
      await act(async () => {
        card.props.onClick({ target: { closest: () => null } });
      });

      const detailText = collectText(findDetailPanel(root.root));
      expect(detailText).toContain('OpenAI');
      expect(detailText).toContain('Azure');
    } finally {
      root.unmount();
    }
  });

  it('automatically matches source models and creates an explicit group', async () => {
    const root = await renderPage();
    try {
      await act(async () => {
        findButtonByText(root.root, '新建分组').props.onClick();
      });

      const nameInput = findInputByPlaceholder(root.root, '例如 gpt-5.5');
      await act(async () => {
        nameInput.props.onChange({ target: { value: 'gpt-5.5' } });
      });

      await act(async () => {
        findButtonByText(root.root, '自动匹配').props.onClick();
      });

      await act(async () => {
        findButtonByText(root.root, '创建分组').props.onClick();
      });
      await flushMicrotasks();

      expect(apiMock.addRoute).toHaveBeenCalledTimes(1);
      const payload = apiMock.addRoute.mock.calls[0]?.[0];
      expect(payload).toMatchObject({
        routeMode: 'explicit_group',
        displayName: 'gpt-5.5',
        routingStrategy: 'stable_first',
        enabled: true,
      });
      expect(payload.autoSourceQuery).toBeUndefined();
      expect([...payload.sourceRouteIds].sort((a, b) => a - b)).toEqual([11, 12]);
    } finally {
      root.unmount();
    }
  });

  it('creates a switch group with an existing group as the active target', async () => {
    const root = await renderPage();
    try {
      await act(async () => {
        findButtonByText(root.root, '新建分组').props.onClick();
      });

      const nameInput = findInputByPlaceholder(root.root, '例如 gpt-5.5');
      await act(async () => {
        nameInput.props.onChange({ target: { value: 'custom' } });
      });

      await act(async () => {
        findButtonByText(root.root, '切换分组').props.onClick();
      });

      const pageText = collectText(root.root);
      expect(pageText).toContain('普通分组');
      expect(pageText).toContain('供应商单模型');

      const groupTargetRow = findSourceRowByTextParts(root.root, ['gpt-5.5', '分组', '2 可用通道']);
      const groupTargetCheckbox = groupTargetRow.findByType('input');
      await act(async () => {
        groupTargetCheckbox.props.onChange();
      });

      await act(async () => {
        findButtonByText(root.root, '创建分组').props.onClick();
      });
      await flushMicrotasks();

      expect(apiMock.addRoute).toHaveBeenCalledTimes(1);
      const payload = apiMock.addRoute.mock.calls[0]?.[0];
      expect(payload).toMatchObject({
        routeMode: 'switch_group',
        displayName: 'custom',
        sourceRouteIds: [21],
        activeSourceRouteId: 21,
      });
    } finally {
      root.unmount();
    }
  });

  it('selects all visible switch targets across separated sections', async () => {
    const root = await renderPage();
    try {
      await act(async () => {
        findButtonByText(root.root, '新建分组').props.onClick();
      });

      const nameInput = findInputByPlaceholder(root.root, '例如 gpt-5.5');
      await act(async () => {
        nameInput.props.onChange({ target: { value: 'custom-all' } });
      });

      await act(async () => {
        findButtonByText(root.root, '切换分组').props.onClick();
      });

      await act(async () => {
        findButtonByExactText(root.root, '全选可见').props.onClick();
      });

      await act(async () => {
        findButtonByText(root.root, '创建分组').props.onClick();
      });
      await flushMicrotasks();

      expect(apiMock.addRoute).toHaveBeenCalledTimes(1);
      const payload = apiMock.addRoute.mock.calls[0]?.[0];
      expect(payload.routeMode).toBe('switch_group');
      expect(payload.activeSourceRouteId).toBe(21);
      expect([...payload.sourceRouteIds].sort((a, b) => a - b)).toEqual([11, 12, 13, 21]);
    } finally {
      root.unmount();
    }
  });

  it('saves manual member edits without re-running backend auto matching', async () => {
    const root = await renderPage();
    try {
      await act(async () => {
        findButtonByText(root.root, '编辑').props.onClick();
      });

      const claudeRow = findSourceRowByText(root.root, 'claude-sonnet-4-5');
      const claudeCheckbox = claudeRow.findByType('input');
      await act(async () => {
        claudeCheckbox.props.onChange();
      });

      await act(async () => {
        findButtonByText(root.root, '保存分组').props.onClick();
      });
      await flushMicrotasks();

      expect(globalThis.confirm).toHaveBeenCalledWith(expect.stringContaining('确认保存对模型分组 gpt-5.5 的更改吗'));
      expect(apiMock.updateRoute).toHaveBeenCalledTimes(1);
      const payload = apiMock.updateRoute.mock.calls[0]?.[1];
      expect(payload.autoSourceQuery).toBeUndefined();
      expect([...payload.sourceRouteIds].sort((a, b) => a - b)).toEqual([11, 12, 13]);
    } finally {
      root.unmount();
    }
  });

  it('saves header template and group custom headers with the explicit group', async () => {
    const root = await renderPage();
    try {
      await act(async () => {
        findButtonByText(root.root, '编辑').props.onClick();
      });

      const headerNameInput = findInputByPlaceholder(root.root, 'Header 名称');
      const headerValueInput = findInputByPlaceholder(root.root, 'Header 值');
      await act(async () => {
        headerNameInput.props.onChange({ target: { value: 'x-codex-client' } });
        headerValueInput.props.onChange({ target: { value: 'cc-switch' } });
      });

      await act(async () => {
        findButtonByText(root.root, '保存分组').props.onClick();
      });
      await flushMicrotasks();

      expect(apiMock.updateRoute).toHaveBeenCalledTimes(1);
      const payload = apiMock.updateRoute.mock.calls[0]?.[1];
      expect(payload.customHeaderTemplateId).toBe(31);
      expect(JSON.parse(payload.customHeaders)).toEqual({
        'x-codex-client': 'cc-switch',
      });
    } finally {
      root.unmount();
    }
  });

  it('does not save group edits when the confirmation is cancelled', async () => {
    vi.mocked(globalThis.confirm).mockReturnValueOnce(false);
    const root = await renderPage();
    try {
      await act(async () => {
        findButtonByText(root.root, '编辑').props.onClick();
      });

      await act(async () => {
        findButtonByText(root.root, '保存分组').props.onClick();
      });
      await flushMicrotasks();

      expect(globalThis.confirm).toHaveBeenCalledTimes(1);
      expect(apiMock.updateRoute).not.toHaveBeenCalled();
    } finally {
      root.unmount();
    }
  });
});
