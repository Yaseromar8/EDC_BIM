import base64

urn_v47 = 'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLkJ4RkxyZi1vU1F5YWtnZ3B3YmdLNGc_dmVyc2lvbj00Nw'
urn_v38 = 'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLkJ4RkxyZi1vU1F5YWtnZ3B3YmdLNGc_dmVyc2lvbj0zOA'

def get_base_urn(b64_urn):
    try:
        padded = b64_urn + '=' * (-len(b64_urn) % 4)
        url_safe = padded.replace('-', '+').replace('_', '/')
        decoded = base64.b64decode(url_safe).decode('utf-8')
        return decoded.split('?')[0]
    except Exception as e:
        return str(e)

print(get_base_urn(urn_v47))
print(get_base_urn(urn_v38))
print(get_base_urn(urn_v47) == get_base_urn(urn_v38))
