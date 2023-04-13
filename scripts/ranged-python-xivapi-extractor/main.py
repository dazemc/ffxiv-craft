import requests
import json
from pathlib import Path
from Buffs import *

# Endpoint
url = "https://xivapi.com/search"
buff_type = ["Medicine", "Meal"]
buff_name = "Meal"

for buff in buff_type:
    buffs = []

    params = {
        "indexes": "item",
        "columns": "Name,Bonuses,Name_en,Name_de,Name_fr,Name_ja",
        "body": {
            "query": {
                "bool": {
                    "should": [
                        {"match": {"Bonuses.CP.Relative": "true"}},
                        {"match": {"Bonuses.Control.Relative": "true"}},
                        {"match": {"Bonuses.Craftsmanship.Relative": "true"}}

                    ],
                    "must_not": [
                        {"match": {"ItemSearchCategory.Name_en": buff}}

                    ]
                }
            },
            "from": 0,
            "size": 100
        }
    }
    request = requests.post(url, json=params)
    request.raise_for_status()
    # print(request.text)

    for i in request.json()["Results"]:
        s_cp_percent = i.get("Bonuses", {}).get("CP", {}).get("Value")
        s_cp_percent_hq = i.get("Bonuses", {}).get("CP", {}).get("ValueHQ")
        s_cp_value = i.get("Bonuses", {}).get("CP", {}).get("Max")
        s_cp_value_hq = i.get("Bonuses", {}).get("CP", {}).get("MaxHQ")
        s_craft_percent = i.get("Bonuses", {}).get("Craftsmanship", {}).get("Value")
        s_craft_percent_hq = i.get("Bonuses", {}).get("Craftsmanship", {}).get("ValueHQ")
        s_craft_value = i.get("Bonuses", {}).get("Craftsmanship", {}).get("Max")
        s_craft_value_hq = i.get("Bonuses", {}).get("Craftsmanship", {}).get("MaxHQ")
        s_control_percent = i.get("Bonuses", {}).get("Control", {}).get("Value")
        s_control_percent_hq = i.get("Bonuses", {}).get("Control", {}).get("ValueHQ")
        s_control_value = i.get("Bonuses", {}).get("Control", {}).get("Max")
        s_control_value_hq = i.get("Bonuses", {}).get("Control", {}).get("MaxHQ")
        s_name = i.get("Name")
        s_name_de = i.get("Name_de")
        s_name_fr = i.get("Name_fr")
        s_name_ja = i.get("Name_ja")
        hq = False
        new_item = vars(
            Buffs(s_cp_percent, s_cp_value, s_craft_percent, s_craft_value, s_control_percent, s_control_value, hq, s_name, s_name_de, s_name_fr, s_name_ja))
        hq = True
        new_item_hq = (vars(
            Buffs(s_cp_percent_hq, s_cp_value_hq, s_craft_percent_hq, s_craft_value_hq, s_control_percent_hq, s_control_value_hq, hq, s_name, s_name_de, s_name_fr, s_name_ja)))
        # Remove None values from previous step

        for v in list(new_item):
            if new_item[v] is None:
                new_item.pop(v)
        buffs.append(new_item)
        for v in list(new_item_hq):
            if new_item_hq[v] is None:
                new_item_hq.pop(v)
        buffs.append(new_item_hq)

    path = Path('out/buffs')
    path.mkdir(exist_ok=True)
    with open(f"out/buffs/{buff_name}.json", mode="w", encoding="utf-8") as my_file:
        my_file.seek(0)
        my_file.write(json.dumps(buffs, indent=2, sort_keys=True, ensure_ascii=False))

    # This is for the second iteration
    buff_name = "Medicine"
with open("main_scraper.py") as recipes:
    exec(recipes.read())
