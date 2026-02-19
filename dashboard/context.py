from dataclasses import dataclass
from typing import Any, Dict


@dataclass
class DashboardContext:
    payload: Dict[str, Any]

    def get(self, key, default=None):
        return self.payload.get(key, default)

    def __getitem__(self, key):
        return self.payload[key]
