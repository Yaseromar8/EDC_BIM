import re

pattern = r'\[[\dA-Fa-f]+\]'

tests = [
    ('Solid [787B]',           True,  'Civil3D hex handle'),
    ('Solid [7880]',           True,  'Civil3D numeric handle'),
    ('Muro [4537502]',        True,  'Revit decimal ElementId'),
    ('Solid [78A3]',           True,  'Civil3D hex handle'),
    ('Solid [789E]',           True,  'Civil3D hex handle'),
    ('Polyline [743A]',        True,  'Civil3D hex handle'),
    ('Suelo [2632255]',        True,  'Revit decimal ElementId'),
    ('Profile : algo (1)',     False, 'Civil3D profile (no bracket)'),
    ('Alignment Station',      False, 'Civil3D alignment (no bracket)'),
    ('Category Name',          False, 'Generic category'),
]

print(f"\n{'Nombre':<45} {'Esperado':<10} {'Resultado':<10} {'OK?':<5} {'Desc'}")
print('-' * 120)
all_pass = True
for name, expected, desc in tests:
    result = bool(re.search(pattern, name))
    ok = result == expected
    if not ok:
        all_pass = False
    print(f"  {name:<43} {str(expected):<10} {str(result):<10} {'✅' if ok else '❌':<5} {desc}")

print(f"\n{'='*60}")
print(f"  RESULTADO: {'TODOS PASARON ✅' if all_pass else 'HAY FALLOS ❌'}")
print(f"{'='*60}")
