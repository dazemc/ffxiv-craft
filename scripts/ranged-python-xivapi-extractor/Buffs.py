# This is used to change the key names
class Buffs:
    def __init__(self, cp_percent, cp_value, craft_percent, craft_value, control_percent, control_value, hq, name, name_de, name_fr, name_ja):
        self.cp_percent = cp_percent
        self.cp_value = cp_value
        self.crafsmanship_percent = craft_percent
        self.crafsmanship_value = craft_value
        self.control_percent = control_percent
        self.control_value = control_value
        self.hq = hq
        # I can't find a where id is even used in the crafting optimizer, so do I
        # self.id = _id
        self.name = {
            "en": name,
            "de": name_de,
            "fr": name_fr,
            "ja": name_ja,
        }



