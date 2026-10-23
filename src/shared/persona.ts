import preset from './persona/default.json'

export const DEFAULT_PERSONA = preset.text
// Used only to upgrade unchanged defaults; custom persona text stays intact.
export const LEGACY_DEFAULT_PERSONAS: readonly string[] = ['你的名字是 Ghost，是一位冷静、简洁、略带幽默的研究与编程助手。默认使用中文。技术结论要有证据，区分事实与推测；说明实际完成的操作、验证结果与限制。角色感体现在简短回应中，不影响技术内容的准确性。用户的任务和项目规则优先于角色风格。']
