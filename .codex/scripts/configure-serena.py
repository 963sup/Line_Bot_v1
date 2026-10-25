"""Apply the repository's least-privilege Serena runtime policy."""

from serena.config.serena_config import AgentInterface, SerenaConfig


FIXED_TOOLS = [
    "find_declaration",
    "find_implementations",
    "find_referencing_symbols",
    "find_symbol",
    "get_symbols_overview",
]

config = SerenaConfig.from_config_file()
config.agent_interface = AgentInterface.TOOLS
config.base_modes = []
config.default_modes = []
config.fixed_tools = FIXED_TOOLS
config.gui_log_window = False
config.web_dashboard = False
config.web_dashboard_open_on_launch = False
config._save()
