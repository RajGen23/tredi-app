"""Best-effort dummy photo picker.

Shops importing stock (via Excel, manual entry, or demo seed) usually don't
have real product photos yet. Rather than leaving a flat grey tile in Quick
Sale / Stock, we guess a category from the item's name (and category field)
and attach a free, publicly licensed stock photo from Wikimedia Commons as a
placeholder. Owners can always replace it later with a real photo — this is
just something better than an empty box "for now".

Matching is ordered: the first bucket whose keyword appears in the item's
name+category wins, so more specific buckets (e.g. "cooking oil") must be
listed before broader ones (e.g. a bare "oil").
"""
import re

_WIKI = "https://thumb.wikimedia.org/wikipedia/commons/thumb"

FALLBACK = f"{_WIKI}/c/ce/Emojione1_1F4E6.svg/500px-Emojione1_1F4E6.svg.png"

# (bucket name, [keywords], image url) — first match wins.
_BUCKETS: list[tuple[str, list[str], str]] = [
    ("cosmetics", ["cream", "serum", "elixir", "scrub", "souffle", "soufflé", "lotion",
                   "herbal soap", "moisturiz", "radiance", "bloom deluxe", "pigment reset",
                   "baby oil", "body oil", "aquaphor", "fair & white", "fair and white"],
     f"{_WIKI}/8/83/Exfoliating_face_scrub.jpg/500px-Exfoliating_face_scrub.jpg"),

    ("smartphone", ["smartphone", "iphone", "samsung", "17promax", "s series", r"\bphones?\b"],
     f"{_WIKI}/b/be/Blackview_A60_Smartphone_Android_mobile_phone_and_folio_case.jpg/500px-Blackview_A60_Smartphone_Android_mobile_phone_and_folio_case.jpg"),

    ("phone_accessory", ["power bank", "powerbank", "charger", "earpod", "ear pod", "earpiece",
                          "ear piece", "type c cable", "v8 cable", "usb cable", "bluetooth",
                          r"\bbt\b"],
     f"{_WIKI}/5/53/Charging_a_smartphone_with_a_USB_power_bank.jpg/500px-Charging_a_smartphone_with_a_USB_power_bank.jpg"),

    ("laptop", ["laptop", "notebook computer"],
     f"{_WIKI}/0/0e/IBM_Thinkpad_R51.jpg/500px-IBM_Thinkpad_R51.jpg"),

    ("television", ["television", r"\btv\b"],
     f"{_WIKI}/0/02/Techwood_flat_screen_television_from_2010.jpg/500px-Techwood_flat_screen_television_from_2010.jpg"),

    ("speaker", ["speaker"],
     f"{_WIKI}/6/69/Sansui_SP-100.jpg/500px-Sansui_SP-100.jpg"),

    ("memory", ["flash", "memory card", "sd card", r"\d+gb\b"],
     f"{_WIKI}/6/6f/Kingston_Technology_DataTraveler_G4_USB_flash_drive_USB_3.0_32_Gb.jpg/500px-Kingston_Technology_DataTraveler_G4_USB_flash_drive_USB_3.0_32_Gb.jpg"),

    ("solar_power", ["solar", "generator", "inverter", "sumec"],
     f"{_WIKI}/9/95/Ground_mounted_solar_panels.gk.jpg/500px-Ground_mounted_solar_panels.gk.jpg"),

    ("water", ["water"],
     f"{_WIKI}/9/92/Photo_of_canned_spring_water._16_oz_reclosable_aluminum_bottle.jpg/500px-Photo_of_canned_spring_water._16_oz_reclosable_aluminum_bottle.jpg"),

    ("fish", ["fish", "catfish"],
     f"{_WIKI}/6/65/Fish_2_WATERFRONT_MARKET.jpg/500px-Fish_2_WATERFRONT_MARKET.jpg"),

    ("rice", ["rice"],
     f"{_WIKI}/9/9a/Sack_Reis.jpg/500px-Sack_Reis.jpg"),

    ("cooking_oil", ["cooking oil"],
     f"{_WIKI}/1/16/Peanut_oil_bottle.jpg/500px-Peanut_oil_bottle.jpg"),

    ("sugar", ["sugar"],
     f"{_WIKI}/d/dc/Sacks_of_raw_sugar_in_the_Philippines.jpg/500px-Sacks_of_raw_sugar_in_the_Philippines.jpg"),

    ("cement", ["cement"],
     f"{_WIKI}/6/62/Portland_Cement_Bags.jpg/500px-Portland_Cement_Bags.jpg"),

    ("flour", ["semovita", "flour", "cassava"],
     f"{_WIKI}/e/ee/A_nice_bag_of_wheat_flour%21.jpg/500px-A_nice_bag_of_wheat_flour%21.jpg"),

    ("detergent", ["detergent", "soap"],
     f"{_WIKI}/b/b5/Laundry_detergent_pods.jpg/500px-Laundry_detergent_pods.jpg"),

    ("paint", ["paint", "betek", "solignum"],
     f"{_WIKI}/8/83/Paint_bucket_and_brush.jpg/500px-Paint_bucket_and_brush.jpg"),

    ("plumbing", ["ppr", "wpp", "wpw", "upvc", "pvc", "pipe", "elbow", "valve", r"\btee\b",
                  "adaptor", "reducing", "coupling", "flange", "deg bend", "landing valve"],
     f"{_WIKI}/8/82/UPVC_pipe_and_fitting.jpg/500px-UPVC_pipe_and_fitting.jpg"),

    ("roofing", ["roof", "purlin", "angle iron", "nail", "sealant", "gutter", "shingle",
                 "flashing", "roofing sheet", "ridge cap"],
     f"{_WIKI}/6/62/Portland_Cement_Bags.jpg/500px-Portland_Cement_Bags.jpg"),

    ("electrical", ["cable", "wire", "lampholder", "control box", "socket", "13amps"],
     f"{_WIKI}/8/84/%27Twin_and_Earth%27_electrical_cable._BS_6004%2C_6mm%C2%B2.jpg/500px-%27Twin_and_Earth%27_electrical_cable._BS_6004%2C_6mm%C2%B2.jpg"),

    ("clothing", ["polo", "shirt", "short", "cardigan", "legging", "tshirt", "t-shirt",
                  "cloth", "shoe", "slipper", "face cap"],
     f"{_WIKI}/6/61/Polo_shirt_3D.jpg/500px-Polo_shirt_3D.jpg"),

    ("bathroom", [r"\bwc\b", "wash basin", "mirror", "shower", "floor drain", "shelf",
                  "rack", "drawer", "spice rack", "wall hung", "close coupled",
                  "water heater", "basin", "wall mounted"],
     f"{_WIKI}/2/24/C_P_Bathrooms%2C_Risca_-_geograph.org.uk_-_1758907.jpg/500px-C_P_Bathrooms%2C_Risca_-_geograph.org.uk_-_1758907.jpg"),

    ("toy", ["toy"],
     f"{_WIKI}/6/60/Modern-baby-roller-skates.jpg/500px-Modern-baby-roller-skates.jpg"),

    ("book", ["bible"],
     f"{_WIKI}/3/33/The_Holy_Bible_-_Upper_cover_%28c8g13%29.jpg/500px-The_Holy_Bible_-_Upper_cover_%28c8g13%29.jpg"),

    ("delivery", ["delivery", "logistics", "transport", "installation", "accommodation",
                  "allowance", "salary", "office supplies", "office equipment"],
     f"{_WIKI}/6/64/Multi_stop_truck_FedEx_Ground_410620.jpg/500px-Multi_stop_truck_FedEx_Ground_410620.jpg"),
]

def _matcher(keyword: str):
    """A plain keyword is a substring check; anything with a backslash (\\b, \\d…) is regex."""
    if "\\" in keyword:
        pattern = re.compile(keyword)
        return lambda hay: bool(pattern.search(hay))
    return lambda hay: keyword in hay

_COMPILED = [(name, [_matcher(k) for k in keys], url) for name, keys, url in _BUCKETS]


def pick_dummy_photo(name: str, category: str = "") -> str:
    """Guess a placeholder photo URL from an item's name/category. Never raises."""
    hay = f"{name or ''} {category or ''}".lower()
    for _, matchers, url in _COMPILED:
        if any(m(hay) for m in matchers):
            return url
    return FALLBACK
