"""Backward-compatible import shim.

The live and maintained study configuration is in :mod:`assistant_modes`.
This filename is retained so older local notes or imports do not break.
"""

from assistant_modes import *  # noqa: F401,F403
