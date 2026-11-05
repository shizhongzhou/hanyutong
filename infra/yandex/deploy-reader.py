"""Update the combined reader/translation service without dropping its configuration."""
from pathlib import Path
import runpy

if __name__ == '__main__':
    runpy.run_path(str(Path(__file__).with_name('deploy-translation.py')), run_name='__main__')
