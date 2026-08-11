"""Generate duct layout PDF in the style of the user's example sheets."""
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from matplotlib.backends.backend_pdf import PdfPages

RED = '#d92020'
GREEN = '#1aa64a'
GRAY = '#888888'

fig = plt.figure(figsize=(17, 11), dpi=200)
fig.patch.set_facecolor('white')

# ---------- Floor plan axes ----------
ax = fig.add_axes([0.025, 0.20, 0.62, 0.72])
ax.set_aspect('equal')
ax.set_xlim(-3, 56)
ax.set_ylim(-5, 36)
ax.axis('off')

ax.text(26, 35, 'FIRST FLOOR MECHANICAL — DUCT LAYOUT',
        ha='center', va='center', fontsize=12, fontweight='bold')

# House outline
ax.plot([0, 51.7, 51.7, 0, 0], [0, 0, 29.2, 29.2, 0],
        color='black', lw=1.8)

# Patio (unconditioned)
ax.add_patch(Rectangle((10, 29.2), 30, 2.5, fill=False,
                       edgecolor=GRAY, lw=0.7, ls='--'))
ax.text(25, 30.4, 'PATIO 103', ha='center', va='center',
        fontsize=6.5, color=GRAY, style='italic')

# Garage (unconditioned)
ax.add_patch(Rectangle((28, -2.5), 23.5, 2.5, fill=False,
                       edgecolor=GRAY, lw=0.7, ls='--'))
ax.text(39.7, -1.3, 'GARAGE 101 (below)', ha='center', va='center',
        fontsize=6.5, color=GRAY, style='italic')

# Conditioned rooms
rooms = [
    ('BR 114',       0,    15,   9,    14.2),
    ('BR 108',       0,    0,    9,    15),
    ('BR 107',       11.4, 0,    12.4, 12),
    ('CLO',          9,    0,    2.4,  15),
    ('HALL 100',     11.4, 12,   12.4, 3),
    ('BATH 111',     14,   15,   6,    5.5),
    ('HALL 117',     20,   15,   3.8,  5.5),
    ('BATH 112',     11.4, 22,   4.0,  3.5),
    ('LIN',          11.4, 25.5, 4.0,  3.7),
    ('LIVING 105',   23.8, 12,   27.9, 17.2),
    ('KITCHEN 116',  23.8, 0,    16.2, 12),
    ('LAUNDRY 104',  40,   0,    11.7, 12),
]
for label, x, y, w, h in rooms:
    ax.add_patch(Rectangle((x, y), w, h, fill=False,
                           edgecolor='black', lw=0.9))
    # Label in top-left corner of each room
    ax.text(x + 0.4, y + h - 0.5, label,
            ha='left', va='top', fontsize=7, color='#333')

# ---------- Drop box & return ----------
# Place drop box in the small alcove between Hall 117 and Bath 112
db_x, db_y = 21.8, 21
ax.add_patch(Rectangle((db_x-1.5, db_y-1.0), 3.0, 2.0,
                       facecolor='#eaeaea', edgecolor='black', lw=1.2))
ax.text(db_x, db_y, 'DROP\nBOX', ha='center', va='center',
        fontsize=6.5, fontweight='bold')

# Return air grille — shown adjacent
ret_x, ret_y = 21.8, 17.5
ax.add_patch(Rectangle((ret_x-1.7, ret_y-0.55), 3.4, 1.1,
                       facecolor='none', edgecolor=GREEN, lw=2))
ax.text(ret_x, ret_y, '20x30 RA', ha='center', va='center',
        fontsize=6.5, color=GREEN, fontweight='bold')

# ---------- Helper: register marker ----------
def register(rx, ry, label, side='below'):
    s = 0.85
    ax.add_patch(Rectangle((rx-s, ry-s), 2*s, 2*s,
                           facecolor='white', edgecolor=RED, lw=1.6))
    ax.plot([rx-s, rx+s], [ry-s, ry+s], color=RED, lw=1.1)
    ax.plot([rx-s, rx+s], [ry+s, ry-s], color=RED, lw=1.1)
    if side == 'below':
        ax.text(rx, ry-s-0.35, label, ha='center', va='top',
                fontsize=7, color=RED, fontweight='bold')
    elif side == 'above':
        ax.text(rx, ry+s+0.35, label, ha='center', va='bottom',
                fontsize=7, color=RED, fontweight='bold')
    elif side == 'right':
        ax.text(rx+s+0.4, ry, label, ha='left', va='center',
                fontsize=7, color=RED, fontweight='bold')
    elif side == 'left':
        ax.text(rx-s-0.4, ry, label, ha='right', va='center',
                fontsize=7, color=RED, fontweight='bold')

# ---------- Helper: flex run ----------
def run(path, size, size_at=None, size_offset=(0, 0.6)):
    xs, ys = zip(*path)
    ax.plot(xs, ys, color=RED, lw=2.0, solid_capstyle='round',
            solid_joinstyle='round', zorder=2)
    if size_at is None:
        # default midpoint of first segment
        mx = (path[0][0] + path[1][0]) / 2
        my = (path[0][1] + path[1][1]) / 2
    else:
        mx, my = size_at
    ax.text(mx + size_offset[0], my + size_offset[1], size,
            ha='center', va='center',
            fontsize=10, color=RED, fontweight='bold',
            bbox=dict(boxstyle='circle,pad=0.10',
                      facecolor='white', edgecolor='none'),
            zorder=3)

DB = (db_x, db_y)

# ---- Run definitions: register, then path from DB, with size+offset ----

# 1. BR 114 (NW) - register near center of room
register(4.5, 22, '10x10-8', side='below')
run([DB, (10, 24), (4.5, 22)], '8', size_at=(13, 23.5), size_offset=(0, 0.7))

# 2. BR 108 (SW)
register(4.5, 7.5, '10x10-8', side='below')
run([DB, (12, 18), (4.5, 18), (4.5, 7.5)], '8',
    size_at=(8, 18), size_offset=(0, 0.8))

# 3. BR 107 (S middle)
register(17.5, 6, '8x8-7', side='below')
run([DB, (18, 18), (17.5, 6)], '7', size_at=(18, 14), size_offset=(0.6, 0))

# 4. Bath 111
register(17, 17.7, '6x6-5', side='left')
run([DB, (20, 19), (17, 17.7)], '5', size_at=(20, 20), size_offset=(-0.7, 0))

# 5. Bath 112 (powder)
register(13.4, 23.7, '6x6-5', side='below')
run([DB, (15, 22), (13.4, 23.7)], '5', size_at=(17.5, 22.5), size_offset=(0, 0.6))

# 6. Laundry 104
register(45.5, 6, '6x6-5', side='below')
run([DB, (40, 21), (47, 14), (45.5, 6)], '5',
    size_at=(43, 16), size_offset=(0.7, 0))

# 7. Living 105 NW
register(31, 25.5, '10x10-8', side='above')
run([DB, (26, 25.5), (31, 25.5)], '8',
    size_at=(26, 23.5), size_offset=(0, 0.6))

# 8. Living 105 NE
register(46, 25.5, '10x10-8', side='above')
run([DB, (26, 22), (40, 22), (46, 25.5)], '8',
    size_at=(34, 22), size_offset=(0, 0.7))

# 9. Kitchen 116 SW (over island)
register(30, 6, '10x10-8', side='below')
run([DB, (28, 17), (30, 6)], '8',
    size_at=(28, 13), size_offset=(-0.8, 0))

# 10. Kitchen 116 SE
register(38, 6, '10x10-8', side='below')
run([DB, (32, 19), (38, 12), (38, 6)], '8',
    size_at=(35, 14), size_offset=(0.8, 0))

# ---------- Equipment callout ----------
ax.annotate('3-TON PKG H/P\n(roof curb above)',
            xy=(db_x, db_y+1), xytext=(db_x+11, 32),
            fontsize=7, fontweight='bold', color='black', ha='center',
            arrowprops=dict(arrowstyle='->', color='black', lw=0.8))

# ---------- North arrow ----------
ax.annotate('', xy=(54, 31), xytext=(54, 28),
            arrowprops=dict(arrowstyle='->', color='black', lw=1.5))
ax.text(54, 31.5, 'N', ha='center', va='bottom',
        fontsize=9, fontweight='bold')

# ---------- Legend (below floor plan, left side) ----------
lg_y = -4
ax.plot([0, 5], [lg_y, lg_y], color=RED, lw=2.2)
ax.text(5.5, lg_y, 'Flex supply (size in circle)', fontsize=7, va='center')

ax.plot([19, 24], [lg_y, lg_y], color=GREEN, lw=2.2)
ax.text(24.5, lg_y, 'Return grille', fontsize=7, va='center')

ax.add_patch(Rectangle((33, lg_y-0.7), 1.4, 1.4,
                       facecolor='white', edgecolor=RED, lw=1.4))
ax.plot([33, 34.4], [lg_y-0.7, lg_y+0.7], color=RED, lw=1)
ax.plot([33, 34.4], [lg_y+0.7, lg_y-0.7], color=RED, lw=1)
ax.text(35, lg_y, 'Ceiling register (face×face‑neck)',
        fontsize=7, va='center')

ax.text(0, -2.3, 'SCALE: NTS  •  schematic — verify field dims',
        fontsize=7, color=GRAY, style='italic')

# ---------- Schedule table ----------
ax2 = fig.add_axes([0.66, 0.30, 0.32, 0.65])
ax2.axis('off')
ax2.set_xlim(0, 1)
ax2.set_ylim(0, 1)

ax2.text(0.5, 0.99, 'SUPPLY SCHEDULE', ha='center', va='top',
         fontsize=12, fontweight='bold')
ax2.text(0.5, 0.955, '3-Ton Pkg Heat Pump • 1,200 CFM • Mesa, AZ',
         ha='center', va='top', fontsize=8, style='italic', color='#444')

headers = ['#', 'ROOM', 'CFM', 'FLEX', 'REGISTER']
rows = [
    ('1', 'Living 105 (NW)',     '150', '8"', '10x10-8'),
    ('2', 'Living 105 (NE)',     '150', '8"', '10x10-8'),
    ('3', 'Kitchen 116 (SW)',    '150', '8"', '10x10-8'),
    ('4', 'Kitchen 116 (SE)',    '150', '8"', '10x10-8'),
    ('5', 'BR 108 (master)',     '150', '8"', '10x10-8'),
    ('6', 'BR 114',              '110', '7"', '8x8-7'),
    ('7', 'BR 107',              '110', '7"', '8x8-7'),
    ('8', 'Bath 111',             '50', '5"', '6x6-5'),
    ('9', 'Bath 112 (powder)',    '50', '5"', '6x6-5'),
    ('10','Laundry 104',          '50', '5"', '6x6-5'),
    ('',  'TOTAL (10 supplies)','1,120','',  ''),
]

col_x = [0.04, 0.12, 0.55, 0.68, 0.82]
col_align = ['left', 'left', 'right', 'center', 'center']

y = 0.90
for cx, h, al in zip(col_x, headers, col_align):
    ax2.text(cx, y, h, fontsize=8.5, fontweight='bold',
             ha=al, va='center')
ax2.plot([0.02, 0.98], [y-0.02, y-0.02], color='black', lw=1.2)

y = 0.87
for r in rows:
    y -= 0.045
    is_total = r[1].startswith('TOTAL')
    if is_total:
        ax2.plot([0.02, 0.98], [y+0.025, y+0.025], color='black', lw=0.8)
    weight = 'bold' if is_total else 'normal'
    for cx, val, al in zip(col_x, r, col_align):
        ax2.text(cx, y, val, fontsize=8, ha=al, va='center',
                 fontweight=weight)

# Notes block
notes_y = 0.32
ax2.text(0.02, notes_y, 'NOTES', fontsize=9, fontweight='bold')
notes = [
    '1.  Flex duct R-8, 0.05 in.wc/100 ft (NCI chart).',
    '2.  Sheet-metal drop box ~22×14×12 above Hall 117.',
    '3.  Return: 20×30 filter grille in hall ceiling.',
    '4.  4 great-room registers matched 10x10-8.',
    '5.  All ceiling registers square — no rectangles.',
    '6.  Hall 117 served by door undercuts / transfer.',
    '7.  Verify final CFMs with Manual J / Manual D.',
    '8.  Pkg unit on roof curb; insulated supply + return',
    '     drops to attic plenum; balance with dampers.',
]
for i, n in enumerate(notes):
    ax2.text(0.02, notes_y - 0.035 - i*0.030, n,
             fontsize=7.5, va='top', family='monospace')

# ---------- Title block ----------
tb = fig.add_axes([0.025, 0.03, 0.95, 0.13])
tb.axis('off')
tb.set_xlim(0, 1)
tb.set_ylim(0, 1)
tb.add_patch(Rectangle((0, 0), 1, 1, fill=False,
                       edgecolor='black', lw=1.5))
for x in [0.55, 0.78]:
    tb.plot([x, x], [0, 1], color='black', lw=1)
tb.plot([0, 1], [0.55, 0.55], color='black', lw=0.8)

tb.text(0.02, 0.78, 'PROJECT', fontsize=8, fontweight='bold', color='#666')
tb.text(0.02, 0.30, 'Mesa, AZ Residence — First Floor Mechanical',
        fontsize=11, fontweight='bold')

tb.text(0.57, 0.78, 'SYSTEM', fontsize=8, fontweight='bold', color='#666')
tb.text(0.57, 0.30, '3-Ton Package Heat Pump (roof) • 1,200 CFM',
        fontsize=10)

tb.text(0.80, 0.78, 'SHEET', fontsize=8, fontweight='bold', color='#666')
tb.text(0.80, 0.30, 'M1.0  •  Duct Layout', fontsize=10)

tb.text(0.02, 0.05, 'SCALE: NTS schematic   •   '
        'FLEX sizing per NCI Field Duct Chart @ 0.05 in.wc/100 ft',
        fontsize=7, color='#444')
tb.text(0.80, 0.05, 'DRAWN BY: HVAC Design',
        fontsize=7, color='#444')

# ---------- Save ----------
out = '/home/user/Housecall-Pro-MCP/duct_layout.pdf'
with PdfPages(out) as pdf:
    pdf.savefig(fig, bbox_inches='tight')
plt.close(fig)
print(f'Wrote {out}')
