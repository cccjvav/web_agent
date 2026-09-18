'use strict';
const store = require('./store');

function modelSettingsError(message) {
  const error = new Error(message);
  error.code = 'E_BAD_MODEL_SETTINGS';
  error.status = 400;
  throw error;
}

function modelRecord(input, currentById) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) modelSettingsError('模型记录必须为对象');
  const model = { ...input };
  if (model.apiKey === '••••') {
    const current = currentById.get(model.id);
    if (!current || typeof current.apiKey !== 'string' || !current.apiKey) modelSettingsError('脱敏API Key不能用于新模型');
    for (const key of ['protocol', 'baseUrl', 'modelId']) {
      if (Object.hasOwn(model, key) && model[key] !== current[key]) modelSettingsError('修改模型连接信息时必须重新填写API Key');
      if (!Object.hasOwn(model, key) && current[key] != null) model[key] = current[key];
    }
    model.apiKey = current.apiKey;
  }
  const stringLimits = { id: 256, name: 256, protocol: 120, baseUrl: 2048, apiKey: 4096,
    modelId: 256, group: 256, contextSize: 64, pricing: 256 };
  for (const [key, limit] of Object.entries(stringLimits)) {
    if (key === 'id' && (typeof model.id !== 'string' || !model.id || model.id !== model.id.trim())) modelSettingsError('模型id缺失或格式无效');
    if (model[key] != null && (typeof model[key] !== 'string' || model[key].length > limit || /[\x00-\x1f\x7f]/.test(model[key]))) {
      modelSettingsError('模型字段格式或长度无效: ' + key);
    }
  }
  if (model.caps != null && (!Array.isArray(model.caps) || model.caps.length > 32
    || model.caps.some(cap => typeof cap !== 'string' || cap.length > 128 || /[\x00-\x1f\x7f]/.test(cap)))) modelSettingsError('模型能力列表格式或长度无效');
  if (model.vision != null && typeof model.vision !== 'boolean') modelSettingsError('vision必须为布尔值');
  return model;
}

function modelRecords(input, currentModels) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) modelSettingsError('models必须包含1–100个模型');
  const currentById = new Map(currentModels.map(model => [model.id, model]));
  const ids = new Set();
  return input.map(item => {
    const model = modelRecord(item, currentById);
    if (ids.has(model.id)) modelSettingsError('模型id不能重复');
    ids.add(model.id);
    return model;
  });
}

function updateModelSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) modelSettingsError('模型设置必须为JSON对象');
  const allowed = new Set(['activeModelId', 'models', 'model', 'multiModel']);
  const keys = Object.keys(input);
  if (!keys.length || keys.some(key => !allowed.has(key))) modelSettingsError('未知或空的模型设置字段');
  if (Object.hasOwn(input, 'models') && Object.hasOwn(input, 'model')) modelSettingsError('models与model不能在同一请求中混用');
  const cfg = store.load(), currentModels = cfg.models;
  if (Object.hasOwn(input, 'models')) cfg.models = modelRecords(input.models, currentModels);
  if (Object.hasOwn(input, 'model')) {
    const currentById = new Map(currentModels.map(model => [model.id, model]));
    let incoming = modelRecord(input.model, currentById);
    const index = cfg.models.findIndex(model => model.id === incoming.id);
    if (index >= 0 && ['protocol', 'baseUrl', 'modelId'].some(key => Object.hasOwn(input.model, key) && input.model[key] !== cfg.models[index][key])
      && !Object.hasOwn(input.model, 'apiKey')) modelSettingsError('修改模型连接信息时必须重新填写API Key');
    incoming = modelRecord(index >= 0 ? { ...cfg.models[index], ...incoming } : incoming, currentById);
    if (index >= 0) cfg.models[index] = incoming;
    else {
      if (cfg.models.length >= 100) modelSettingsError('最多保存100个模型');
      cfg.models.push(incoming);
    }
  }
  if (Object.hasOwn(input, 'activeModelId')) {
    if (typeof input.activeModelId !== 'string' || !input.activeModelId || input.activeModelId.length > 256
      || input.activeModelId !== input.activeModelId.trim() || !cfg.models.some(model => model.id === input.activeModelId)) {
      modelSettingsError('活动模型必须引用当前模型列表中的有效id');
    }
    cfg.activeModelId = input.activeModelId;
  } else if ((Object.hasOwn(input, 'models') || Object.hasOwn(input, 'model')) && !cfg.models.some(model => model.id === cfg.activeModelId)) {
    modelSettingsError('模型更新不能移除当前活动模型；请在同一请求中明确选择仍存在的模型');
  }
  if (Object.hasOwn(input, 'multiModel')) {
    const partial = input.multiModel;
    if (!partial || typeof partial !== 'object' || Array.isArray(partial)) modelSettingsError('multiModel必须为对象');
    const multiKeys = Object.keys(partial), validKeys = new Set(['enabled', 'mergeModel', 'thinkLevel', 'maxBranches', 'mergeAllowsRead']);
    if (!multiKeys.length || multiKeys.some(key => !validKeys.has(key))) modelSettingsError('未知或空的multiModel字段');
    for (const key of ['enabled', 'mergeAllowsRead']) if (Object.hasOwn(partial, key) && typeof partial[key] !== 'boolean') modelSettingsError(key + '必须为布尔值');
    if (Object.hasOwn(partial, 'maxBranches') && (!Number.isInteger(partial.maxBranches) || partial.maxBranches < 2 || partial.maxBranches > 8)) modelSettingsError('maxBranches必须为2–8的整数');
    if (Object.hasOwn(partial, 'thinkLevel') && !['low', 'medium', 'high'].includes(partial.thinkLevel)) modelSettingsError('thinkLevel必须为low、medium或high');
    if (Object.hasOwn(partial, 'mergeModel') && (typeof partial.mergeModel !== 'string' || !partial.mergeModel
      || !['active', 'auto'].includes(partial.mergeModel) && !cfg.models.some(model => model.id === partial.mergeModel))) {
      modelSettingsError('mergeModel必须引用当前模型或使用active/auto');
    }
    cfg.multiModel = { ...cfg.multiModel, ...partial };
  }
  store.save(cfg);
  return { success: true, activeModelId: cfg.activeModelId, modelCount: cfg.models.length, multiModel: cfg.multiModel };
}

module.exports = { updateModelSettings };
