// deno-fmt-ignore-file
// biome-ignore format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages, GetConfigResponse, SearchCodecsForPages } from 'waku/router';

// prettier-ignore
import type { getConfig as File_404_getConfig } from './pages/404';
// prettier-ignore
import type { getConfig as File_Root_getConfig } from './pages/_root';
// prettier-ignore
import type { getConfig as File_AdminUsersIndex_getConfig } from './pages/admin/users/index';
// prettier-ignore
import type { getConfig as File_CategoriesIdIndex_getConfig } from './pages/categories/[id]/index';
// prettier-ignore
import type { getConfig as File_Index_getConfig } from './pages/index';
// prettier-ignore
import type { getConfig as File_LoginIndex_getConfig } from './pages/login/index';
// prettier-ignore
import type { getConfig as File_MemosIdEditIndex_getConfig } from './pages/memos/[id]/edit/index';
// prettier-ignore
import type { getConfig as File_MemosCreateBulkIndex_getConfig } from './pages/memos/create/bulk/index';
// prettier-ignore
import type { getConfig as File_MemosCreateIndex_getConfig } from './pages/memos/create/index';
// prettier-ignore
import type { getConfig as File_MemosUrlSummaryIndex_getConfig } from './pages/memos/url-summary/index';
// prettier-ignore
import type { getConfig as File_PrivacyIndex_getConfig } from './pages/privacy/index';
// prettier-ignore
import type { getConfig as File_SettingsAccountIndex_getConfig } from './pages/settings/account/index';
// prettier-ignore
import type { getConfig as File_SettingsCategoriesIndex_getConfig } from './pages/settings/categories/index';
// prettier-ignore
import type { getConfig as File_SettingsFilesIndex_getConfig } from './pages/settings/files/index';
// prettier-ignore
import type { getConfig as File_SettingsIndex_getConfig } from './pages/settings/index';
// prettier-ignore
import type { getConfig as File_SettingsPlanIndex_getConfig } from './pages/settings/plan/index';
// prettier-ignore
import type { getConfig as File_SettingsTagsIndex_getConfig } from './pages/settings/tags/index';
// prettier-ignore
import type { getConfig as File_ShareConsumeIndex_getConfig } from './pages/share/consume/index';
// prettier-ignore
import type { getConfig as File_ShareIndex_getConfig } from './pages/share/index';
// prettier-ignore
import type { getConfig as File_TermsIndex_getConfig } from './pages/terms/index';

// prettier-ignore
type Page =
| ({ path: '/404' } & GetConfigResponse<typeof File_404_getConfig>)
| ({ path: '/_root' } & GetConfigResponse<typeof File_Root_getConfig>)
| ({ path: '/admin/users' } & GetConfigResponse<typeof File_AdminUsersIndex_getConfig>)
| ({ path: '/categories/[id]' } & GetConfigResponse<typeof File_CategoriesIdIndex_getConfig>)
| ({ path: '/' } & GetConfigResponse<typeof File_Index_getConfig>)
| ({ path: '/login' } & GetConfigResponse<typeof File_LoginIndex_getConfig>)
| ({ path: '/memos/[id]/edit' } & GetConfigResponse<typeof File_MemosIdEditIndex_getConfig>)
| ({ path: '/memos/create/bulk' } & GetConfigResponse<typeof File_MemosCreateBulkIndex_getConfig>)
| ({ path: '/memos/create' } & GetConfigResponse<typeof File_MemosCreateIndex_getConfig>)
| ({ path: '/memos/url-summary' } & GetConfigResponse<typeof File_MemosUrlSummaryIndex_getConfig>)
| ({ path: '/privacy' } & GetConfigResponse<typeof File_PrivacyIndex_getConfig>)
| ({ path: '/settings/account' } & GetConfigResponse<typeof File_SettingsAccountIndex_getConfig>)
| ({ path: '/settings/categories' } & GetConfigResponse<typeof File_SettingsCategoriesIndex_getConfig>)
| ({ path: '/settings/files' } & GetConfigResponse<typeof File_SettingsFilesIndex_getConfig>)
| ({ path: '/settings' } & GetConfigResponse<typeof File_SettingsIndex_getConfig>)
| ({ path: '/settings/plan' } & GetConfigResponse<typeof File_SettingsPlanIndex_getConfig>)
| ({ path: '/settings/tags' } & GetConfigResponse<typeof File_SettingsTagsIndex_getConfig>)
| ({ path: '/share/consume' } & GetConfigResponse<typeof File_ShareConsumeIndex_getConfig>)
| ({ path: '/share' } & GetConfigResponse<typeof File_ShareIndex_getConfig>)
| ({ path: '/terms' } & GetConfigResponse<typeof File_TermsIndex_getConfig>);

// prettier-ignore
type Layout =
| { path: '/' }
| { path: '/settings' };

// prettier-ignore
declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<Page>;
  }
  interface CreatePagesConfig {
    pages: Page;
    layouts: Layout;
  }
  interface SearchCodecsConfig extends SearchCodecsForPages<Page> {}
}
