"""Build the common 6-by-4 printable list from the approved study configuration."""
import sys
from pathlib import Path

from pypdf import PdfReader
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import reportlab

FONT_DIR = Path(reportlab.__file__).parent / 'fonts'
pdfmetrics.registerFont(TTFont('Helvetica', str(FONT_DIR / 'Vera.ttf')))
pdfmetrics.registerFont(TTFont('Helvetica-Bold', str(FONT_DIR / 'VeraBd.ttf')))

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from assistant_modes import DESERT_ISLAND_ITEMS, DESERT_ISLAND_QUANTITIES

ASSETS = ROOT / 'docs' / 'item-list-assets'
OUTPUT = ROOT / 'output' / 'pdf' / 'Survival-Activity-24-Items.pdf'
ORIGINAL_ORDER = [
    'Flashlight', 'Canned beans', 'First-aid kit', 'Fishing net', 'Rope', 'Dog',
    'Compass', 'Cat', 'Sleeping bag', 'Matches', 'Survival book', 'Magnifying glass',
    'Guitar', 'Hammock', 'Knife', 'Sunscreen', 'Machete', 'Blanket',
    'Shovel', 'Family photo', 'Hatchet', 'Radio', 'Toothbrush and toothpaste',
]
REPLACEMENTS = {'Magnifying glass': 'Tent', 'Hammock': 'Insulated sleeping mat',
                'Blanket': 'Portable stove with fuel', 'Radio': 'Metal cooking pot'}
ORDER = [REPLACEMENTS.get(x, x) for x in ORIGINAL_ORDER] + ['Bug spray']

def slug(text):
    return text.lower().replace(' ', '-')

def lines(text, width, size):
    result, current = [], ''
    for word in text.split():
        candidate = (current + ' ' + word).strip()
        if current and stringWidth(candidate, 'Helvetica-Bold', size) > width:
            result.append(current)
            current = word
        else:
            current = candidate
    return result + [current]

def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if len(sys.argv) > 1:
        # The original has one image per card in reading order.
        source = PdfReader(sys.argv[1])
        assert len(source.pages[0].images) == len(ORIGINAL_ORDER)
        for name, image in zip(ORIGINAL_ORDER, source.pages[0].images):
            if name not in REPLACEMENTS:
                (ASSETS / (slug(name) + '.jpg')).write_bytes(image.data)
    assert len(ORDER) == len(set(ORDER)) == 24
    assert set(ORDER) == set(DESERT_ISLAND_ITEMS)
    c = canvas.Canvas(str(OUTPUT), pagesize=(792, 612))
    c.setTitle('Survival Activity - 24 Shared Items')
    c.setAuthor('HI Lab - Buzz Study')
    c.setFillColor(HexColor('#f4f0e5'))
    c.rect(0, 0, 792, 612, fill=1, stroke=0)
    c.setFillColor(HexColor('#173d34'))
    c.setFont('Helvetica-Bold', 24)
    c.drawString(24, 580, 'Survival Activity')
    c.setFont('Helvetica', 9)
    c.drawString(24, 562, 'SHARED ITEM LIST FOR DESERTED ISLAND AND NORTH POLE')
    c.setFillColor(HexColor('#205c4d'))
    c.roundRect(688, 569, 80, 22, 3, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 11)
    c.drawCentredString(728, 576, '24 ITEMS')
    c.setStrokeColor(HexColor('#205c4d'))
    c.line(24, 551, 768, 551)
    c.setFillColor(HexColor('#46544f'))
    c.setFont('Helvetica', 9)
    c.drawString(24, 538, 'Choose exactly three different options. Each card counts as one choice.')
    w, h, gap = (744 - 5*7)/6, 120, 7
    for i, name in enumerate(ORDER):
        row, col = divmod(i, 6)
        x, y = 24 + col*(w+gap), 527 - row*(h+gap) - h
        c.setFillColor(white)
        c.setStrokeColor(HexColor('#d6ccba'))
        c.roundRect(x, y, w, h, 5, fill=1, stroke=1)
        source = ASSETS / (slug(name) + ('.png' if name in REPLACEMENTS.values() or name == 'Bug spray' else '.jpg'))
        image = ImageReader(str(source))
        iw, ih = image.getSize()
        scale = min((w-10)/iw, 72/ih)
        dw, dh = iw*scale, ih*scale
        c.drawImage(image, x+(w-dw)/2, y+44+(76-dh)/2, dw, dh, mask='auto')
        c.setStrokeColor(HexColor('#ded7c9'))
        c.line(x, y+43, x+w, y+43)
        badge = 30
        c.setFillColor(HexColor('#d88b27'))
        c.rect(x+w-badge, y+1, badge-1, 42, fill=1, stroke=0)
        c.setFillColor(HexColor('#173d34'))
        size = 9.2
        wrapped = lines(name, w-badge-9, size)
        while len(wrapped) > 3:
            size -= 0.3
            wrapped = lines(name, w-badge-9, size)
        c.setFont('Helvetica-Bold', size)
        top = y+21.5+(len(wrapped)-1)*5.2
        for n, line in enumerate(wrapped):
            c.drawString(x+4, top-n*10.4-3, line)
        quantity = DESERT_ISLAND_QUANTITIES.get(name, '1')
        if name == 'Portable stove with fuel':
            qlines = ['1', 'SET']
        else:
            qlines = quantity.upper().split()
        c.setFillColor(white)
        quantity_size = 11 if len(qlines) == 1 else 8.3
        while max(stringWidth(line, 'Helvetica-Bold', quantity_size) for line in qlines) > badge - 4:
            quantity_size -= 0.2
        c.setFont('Helvetica-Bold', quantity_size)
        for n, line in enumerate(qlines):
            c.drawCentredString(x+w-badge/2, y+20+(len(qlines)-1)*4.7-n*9.4, line)
    c.setFillColor(HexColor('#46544f'))
    c.setFont('Helvetica', 8)
    c.drawString(24, 13, 'Stove includes fuel for three days. Cooking pot is separate. Canned beans includes all five cans.')
    c.save()
    reader = PdfReader(str(OUTPUT))
    text = ' '.join(reader.pages[0].extract_text().split())
    for name in ORDER:
        assert name in text, (name, text)
    assert len(reader.pages) == 1
    print(OUTPUT)

if __name__ == '__main__':
    main()
