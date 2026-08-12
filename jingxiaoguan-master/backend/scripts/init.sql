-- 创建数据库
CREATE DATABASE IF NOT EXISTS `contract_assistant` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `contract_assistant`;

-- 1. 用户表
CREATE TABLE IF NOT EXISTS `sys_user` (
  `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `username` VARCHAR(50) NOT NULL UNIQUE COMMENT '登录账号',
  `password` VARCHAR(100) NOT NULL COMMENT '密码（加密存储）',
  `real_name` VARCHAR(50) NOT NULL COMMENT '真实姓名',
  `role` TINYINT NOT NULL DEFAULT 1 COMMENT '角色：0管理员 1普通用户',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1启用 0禁用',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `delete_status` TINYINT NOT NULL DEFAULT 0 COMMENT '删除标志：0正常 1已删除'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统用户表';

-- 2. 数据字典表
CREATE TABLE IF NOT EXISTS `sys_dict` (
  `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `dict_type` VARCHAR(50) NOT NULL COMMENT '字典类型',
  `dict_label` VARCHAR(50) NOT NULL COMMENT '字典标签名称',
  `dict_value` VARCHAR(50) NOT NULL COMMENT '字典键值',
  `sort_order` INT DEFAULT 0 COMMENT '排序字段',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT '备注信息',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统数据字典表';

-- 3. 合同台账表
CREATE TABLE IF NOT EXISTS `contract_ledger` (
  `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `contract_no` VARCHAR(50) NOT NULL UNIQUE COMMENT '合同编号',
  `customer_name` VARCHAR(100) NOT NULL COMMENT '客户名称',
  `contract_name` VARCHAR(150) NOT NULL COMMENT '合同名称',
  `contract_type` TINYINT NOT NULL DEFAULT 1 COMMENT '合同类型：1框架协议 2单项合同 3补充协议 4解除协议 5变更协议',
  `sign_date` DATE NOT NULL COMMENT '签约时间',
  `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00 COMMENT '合同金额（含税）',
  `assessment_line` VARCHAR(50) DEFAULT '通用' COMMENT '考核线',
  `has_ai_keyword` TINYINT NOT NULL DEFAULT 0 COMMENT '是否包含AI关键词：0否 1是',
  `contract_status` TINYINT NOT NULL DEFAULT 2 COMMENT '合同状态：1流水中 2已签约 3已闭环 4已作废',
  `verify_status` TINYINT NOT NULL DEFAULT 0 COMMENT '核对状态：0未核对 1已核对 2异常',
  `warning_status` TINYINT NOT NULL DEFAULT 0 COMMENT '断档预警：0正常 1预警',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `delete_status` TINYINT NOT NULL DEFAULT 0 COMMENT '删除状态：0正常 1已删除'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同台账表';

-- 4. 关键词管理表
CREATE TABLE IF NOT EXISTS `contract_keyword` (
  `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `keyword_name` VARCHAR(50) NOT NULL COMMENT '关键词名称',
  `category` VARCHAR(50) NOT NULL COMMENT '所属分类',
  `description` VARCHAR(255) DEFAULT NULL COMMENT '规则说明',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1启用 0禁用',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `delete_status` TINYINT NOT NULL DEFAULT 0 COMMENT '删除状态：0正常 1已删除'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同AI关键词管理表';

-- 5. 合同范本模块表
CREATE TABLE IF NOT EXISTS `contract_section` (
  `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `section_title` VARCHAR(100) NOT NULL COMMENT '模块标题',
  `category` VARCHAR(50) NOT NULL COMMENT '模块分类',
  `content` TEXT NOT NULL COMMENT '标准条款文本内容',
  `version` VARCHAR(20) DEFAULT 'v1.0' COMMENT '版本号',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `delete_status` TINYINT NOT NULL DEFAULT 0 COMMENT '删除状态：0正常 1已删除'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同标准范本模块表';

-- 6. 文件持久化管理表（支持3个月保留期限限制）
CREATE TABLE IF NOT EXISTS `sys_file` (
  `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `file_name` VARCHAR(150) NOT NULL COMMENT '文件原始名称',
  `file_path` VARCHAR(255) NOT NULL COMMENT '服务器物理存储路径',
  `file_url` VARCHAR(255) NOT NULL COMMENT 'Web可访问网络路径',
  `file_size` BIGINT NOT NULL COMMENT '文件字节大小',
  `file_type` VARCHAR(50) DEFAULT NULL COMMENT '文件类型/扩展名',
  `uploader_id` INT DEFAULT NULL COMMENT '上传者ID',
  `upload_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  `expire_time` DATETIME NOT NULL COMMENT '自动清理到期时间（3个月后）',
  `delete_status` TINYINT NOT NULL DEFAULT 0 COMMENT '删除状态：0正常 1已物理/软删除'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文件存储及声明周期管理表';

-- 7. 合同履约与核对历史表
CREATE TABLE IF NOT EXISTS `contract_history` (
  `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `contract_id` INT NOT NULL COMMENT '关联合同ID',
  `action_type` VARCHAR(50) NOT NULL COMMENT '操作类型',
  `operator_name` VARCHAR(50) NOT NULL COMMENT '操作人',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT '备注说明',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同履约与核对历史记录表';

-- ==================== 初始种子数据 ====================

-- 插入默认管理员与测试账号 (password 为 admin123 加密后的MD5/Hash: 0192023a7bbd73250516f069df18b500)
INSERT INTO `sys_user` (`username`, `password`, `real_name`, `role`, `status`) VALUES
('admin', '53801c1df9e41f90b77ae9756980732b', '张三', 0, 1),
('user', '53801c1df9e41f90b77ae9756980732b', '李四', 1, 1)
ON DUPLICATE KEY UPDATE `password`='53801c1df9e41f90b77ae9756980732b';

-- 插入数据字典
INSERT INTO `sys_dict` (`dict_type`, `dict_label`, `dict_value`, `sort_order`, `remark`) VALUES
('contract_status', '流水中', '1', 1, '审批流水中'),
('contract_status', '已签约', '2', 2, '双方已盖章签约'),
('contract_status', '已闭环', '3', 3, '合同履约完成闭环'),
('contract_status', '已作废', '4', 4, '合同终止作废'),

('contract_type', '框架协议', '1', 1, '主框架协议'),
('contract_type', '单项合同', '2', 2, '独立单项服务合同'),
('contract_type', '补充协议', '3', 3, '变更补充条款'),
('contract_type', '解除协议', '4', 4, '提前解除协议'),
('contract_type', '变更协议', '5', 5, '条款变更协议'),

('verify_status', '未核对', '0', 1, '尚未进行AI智能核对'),
('verify_status', '已核对', '1', 2, '核对一致无误'),
('verify_status', '异常', '2', 3, '条款偏差风险预警'),

('user_role', '管理员', '0', 1, '超级系统管理员'),
('user_role', '普通用户', '1', 2, '普通业务操作人员')
ON DUPLICATE KEY UPDATE `id`=`id`;

-- 插入示范合同台账数据
INSERT INTO `contract_ledger` (`contract_no`, `customer_name`, `contract_name`, `contract_type`, `sign_date`, `amount`, `assessment_line`, `has_ai_keyword`, `contract_status`, `verify_status`, `warning_status`) VALUES
('HT-2026-0892', '兴晟泽科技有限公司', '智能运维服务合同', 2, '2026-07-15', 860000.00, '电力', 1, 2, 0, 0),
('HT-2026-0751', '国网电力服务中心', '年度技术框架协议', 1, '2026-06-20', 2500000.00, '电力', 1, 2, 1, 0),
('HT-2026-0610', '华南建工集团有限公司', '信息化系统采购升级合同', 2, '2026-05-18', 1200000.00, '建筑', 0, 1, 0, 1),
('HT-2026-0422', '远东通信股份有限公司', '网络安全优化服务补充协议', 3, '2026-04-10', 350000.00, '通信', 1, 3, 1, 0)
ON DUPLICATE KEY UPDATE `contract_no`=`contract_no`;

-- 插入示范AI关键词
INSERT INTO `contract_keyword` (`keyword_name`, `category`, `description`, `status`) VALUES
('人工智能算力租用', '核心业务', '涵盖GPU/NPU算力租赁及调度条款', 1),
('SLA可用性99.9%', '服务标准', '运维服务等级考核指标线', 1),
('违约金不超过10%', '风险控制', '违约赔偿责任上限管控', 1),
('数据保密协议', '合规管理', '客户敏感数据脱敏与保密约定', 1)
ON DUPLICATE KEY UPDATE `keyword_name`=`keyword_name`;

-- 插入范本模块数据
INSERT INTO `contract_section` (`section_title`, `category`, `content`, `version`) VALUES
('保密条款', '通用条款', '双方应对在履行本合同过程中知悉的乙方商业秘密、技术数据及客户资料严格保密...', 'v1.0'),
('违约责任条款', '风险管控', '任何一方违反本合同约定的履行义务，应向守约方支付合同总额5%的违约金...', 'v1.1'),
('不可抗力条款', '免责约定', '因自然灾害、战争、国家政策重大调整等不可抗力因素导致合同无法履行的，双方互不承担违约责任...', 'v1.0')
ON DUPLICATE KEY UPDATE `section_title`=`section_title`;
