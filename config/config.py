
"""
配置管理器：负责加载和验证YAML配置文件
"""
import os
import yaml
from typing import Any, Dict

# 项目根目录（config 模块所在目录的上级），保证任意 cwd 下都能找到配置文件
_CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_CONFIG_DIR)
_DEFAULT_CONFIG_DIR = os.path.join(_PROJECT_ROOT, 'config')


class ConfigManager:
    def __init__(self, config_path: str = "config"):
        """
        初始化配置管理器
        :param config_path: 配置目录名或绝对路径，默认使用项目下 config 目录
        """
        if config_path == "config":
            config_path = _DEFAULT_CONFIG_DIR
        self.config_path = os.path.join(config_path, 'settings.yaml')
        # print(f"配置文件路径: {self.config_path}", flush=True)

        self._config = self._load_config()

    def _load_config(self) -> Dict[str, Any]:
        """加载并验证配置文件"""
        try:
            if not os.path.exists(self.config_path):
                raise FileNotFoundError(f"Config file not found: {self.config_path}")

            with open(self.config_path, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)

            # print("配置文件加载成功", flush=True)

            # 验证必要配置项
            required = ['mode', 'account']
            for key in required:
                if key not in config:
                    raise ValueError(f"Missing required config section: {key}")

            return config

        except FileNotFoundError as e:
            print(f"配置文件加载失败: {e}", flush=True)
            raise
        except yaml.YAMLError as e:
            print(f"解析 YAML 文件时出错: {e}", flush=True)
            raise
        except ValueError as e:
            print(f"配置文件验证失败: {e}", flush=True)
            raise

    def get(self, key: str, default: Any = None) -> Any:
        """
        安全获取配置项
        :param key: 点分格式键，如 'account.account_id'
        :param default: 默认值
        """
        keys = key.split('.')
        value = self._config
        for k in keys:
            value = value.get(k, {})
        return value if value != {} else default

    def clone(self) -> 'ConfigManager':
        """深拷贝当前配置并返回新实例"""
        return ConfigManager()

    def update(self, new_values: Dict[str, Any]) -> None:
        """递归更新配置项"""
        def merge_dict(target: Dict, update: Dict) -> None:
            """递归合并字典"""
            for key, value in update.items():
                if isinstance(value, dict):
                    node = target.setdefault(key, {})
                    merge_dict(node, value)
                else:
                    target[key] = value

        merge_dict(self._config, new_values)    

config = ConfigManager()
