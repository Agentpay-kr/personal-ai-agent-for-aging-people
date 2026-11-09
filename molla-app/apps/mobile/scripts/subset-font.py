"""Rebuild the bundled OFL font; requires fonttools and pnpm install."""
from pathlib import Path
from fontTools import subset

root = Path(__file__).resolve().parent.parent
source = root / 'node_modules/@expo-google-fonts/gowun-batang/400Regular/GowunBatang_400Regular.ttf'
target = root / 'assets/fonts/GowunBatang-Korean.ttf'
target.parent.mkdir(parents=True, exist_ok=True)
subset.main([
    str(source), f'--output-file={target}',
    # Only static editorial headings use this face. Dynamic copy uses system fonts.
    '--text=오늘도, 당신 곁에. 어떤 이야기든, 편하게 들려주세요. 부탁한 일 나의 몰라 우리의 공간을, 연결해 볼까요.',
    '--name-IDs=*', '--name-languages=*', '--name-legacy',
])
license_source = root / 'node_modules/@expo-google-fonts/gowun-batang/LICENSE_FONT'
(target.parent / 'OFL.txt').write_bytes(license_source.read_bytes())
print(f'Font: {source.stat().st_size:,} -> {target.stat().st_size:,} bytes')
