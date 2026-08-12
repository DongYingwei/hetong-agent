import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePermissionStore = defineStore('permission', () => {
  // 默认各角色的可访问菜单 ID 集合
  const defaultRolePerms: Record<string, number[]> = {
    // 管理员：包含所有 12 个菜单项
    admin: [1, 11, 15, 12, 13, 14, 2, 21, 22, 23, 24, 25, 26, 27],
    管理员: [1, 11, 15, 12, 13, 14, 2, 21, 22, 23, 24, 25, 26, 27],

    // 合同专员：包含台账、订单台账、智能检索、关键词、合同模块、我的部门
    'contract:specialist': [1, 11, 15, 12, 13, 14, 2, 26],
    合同专员: [1, 11, 15, 12, 13, 14, 2, 26],

    // 法务人员：包含台账、订单台账、智能检索、合同模块、文件管理
    'legal:staff': [1, 11, 15, 12, 14, 2, 26, 27],
    法务人员: [1, 11, 15, 12, 14, 2, 26, 27],

    // 部门负责人：包含台账、订单台账、智能检索、部门管理、我的部门
    'dept:leader': [1, 11, 15, 12, 2, 25, 26],
    部门负责人: [1, 11, 15, 12, 2, 25, 26],

    // 高管：包含智能检索、我的部门
    executive: [1, 12, 2, 26],
    高管: [1, 12, 2, 26],
  };

  // 始终以 defaultRolePerms 为基准，localStorage 仅用于保存自定义覆盖
  // 防止旧数据丢失 admin 等核心角色的菜单权限
  function buildPermissions(): Record<string, number[]> {
    let stored: Record<string, number[]> = {};
    try {
      const storedPerms = localStorage.getItem('contract_role_perms');
      if (storedPerms) stored = JSON.parse(storedPerms);
    } catch (e) {}
    // 合并：defaultRolePerms 始终覆盖 stored 中的核心角色配置
    return { ...stored, ...defaultRolePerms };
  }

  const rolePermissions = ref<Record<string, number[]>>(buildPermissions());

  // 菜单 ID 与 路径 映射表
  const menuPathMap: Record<string, number> = {
    '/ledger': 11,
    '/orders': 15,
    '/agent-search': 12,
    '/keywords': 13,
    '/sections': 14,
    '/menu': 21,
    '/homepage': 22,
    '/users': 23,
    '/roles': 24,
    '/departments': 25,
    '/my-department': 26,
    '/files': 27,
  };

  /**
   * 保存角色配置的最新菜单权限
   */
  function setRolePermissions(roleKey: string, checkedKeys: number[]) {
    rolePermissions.value[roleKey] = checkedKeys;
    localStorage.setItem('contract_role_perms', JSON.stringify(rolePermissions.value));
  }

  /**
   * 判断指定角色是否拥有某个路径的访问权限
   */
  function hasPermission(roleNameOrKey?: string | number, path?: string): boolean {
    if (!path) return true;
    const menuId = menuPathMap[path];
    if (!menuId) return true; // 未在映射表中的路由默认放行

    let targetRole = '普通用户';
    if (typeof roleNameOrKey === 'number') {
      if (roleNameOrKey === 0) targetRole = '管理员';
      else if (roleNameOrKey === 1) targetRole = '合同专员';
      else if (roleNameOrKey === 2) targetRole = '法务人员';
      else if (roleNameOrKey === 3) targetRole = '部门负责人';
    } else if (typeof roleNameOrKey === 'string' && roleNameOrKey.trim()) {
      targetRole = roleNameOrKey.trim();
    } else {
      // 从 localStorage 尝试还原当前登录用户的角色
      try {
        const storedUser = localStorage.getItem('contract_user');
        if (storedUser) {
          const u = JSON.parse(storedUser);
          if (u.roleName) targetRole = u.roleName;
          else if (u.role === 0) targetRole = '管理员';
          else if (u.role === 1) targetRole = '合同专员';
          else if (u.role === 2) targetRole = '法务人员';
          else if (u.role === 3) targetRole = '部门负责人';
        }
      } catch (e) {
        targetRole = '普通用户';
      }
    }

    const allowedMenuIds = rolePermissions.value[targetRole] || rolePermissions.value['admin'] || defaultRolePerms.admin;
    return allowedMenuIds.includes(menuId);
  }

  return {
    rolePermissions,
    setRolePermissions,
    hasPermission,
  };
});
