// Empty module used to replace devtools packages in production builds
// This file is aliased to devtools packages during production builds
// to ensure they are completely tree-shaken from the bundle

export default {};
export const TanStackDevtools = () => null;
export const ReactQueryDevtools = () => null;
export const TanStackRouterDevtoolsPanel = () => null;
export const aiDevtoolsPlugin = () => ({});
