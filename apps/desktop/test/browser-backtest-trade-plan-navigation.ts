// 只替换浏览器不存在的原生导航；真实页面、查询与中文投影保持源码。
export const useRoute = () => ({
  params: { strategyId: 'trade-plan-qa', versionId: 'trade-plan-version' },
});
export const useNavigation = () => ({
  navigate: () => {
    throw new Error('本验收不执行导航提交');
  },
});
