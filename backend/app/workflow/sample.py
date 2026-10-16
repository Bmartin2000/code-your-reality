"""Predefined example material for the guided demo (Path A) and the rental template.

Everything in this module is authored by hand and is always presented in the UI as sample data.
It is never presented as the output of an AI model.
"""

from __future__ import annotations

from typing import Any

SAMPLE_NARRATION_TITLE = "Counter walkthrough — equipment rental (example)"

# Example narration of a rental clerk, segmented with timestamps (seconds).
SAMPLE_TRANSCRIPT: list[dict[str, Any]] = [
    {"start": 0.0, "end": 4.0, "text": "Okay, so this is how a rental works at our counter."},
    {"start": 4.0, "end": 9.0, "text": "A customer comes in and picks a piece of equipment from the shelf — say this camera."},
    {"start": 9.0, "end": 14.0, "text": "First I check the board. If it's marked available, we can rent it. If it's out or in maintenance, we can't."},
    {"start": 14.0, "end": 21.0, "text": "Then I take their name, email and phone number. New customers go into the binder."},
    {"start": 21.0, "end": 27.0, "text": "We write down the start date and the date they promise to bring it back."},
    {"start": 27.0, "end": 33.0, "text": "Every rental needs a deposit. I write the amount on the slip — it can't be negative, obviously."},
    {"start": 33.0, "end": 39.0, "text": "Once that's done I flip the tag on the board to 'rented' so nobody else takes it."},
    {"start": 39.0, "end": 46.0, "text": "One item, one customer per slip. And an item can only be out with one customer at a time."},
    {"start": 46.0, "end": 53.0, "text": "When it comes back I check it, write the return date on the slip and mark it returned."},
    {"start": 53.0, "end": 60.0, "text": "Then the tag goes back to 'available' and it's back on the shelf."},
]

# Illustrated storyboard scenes for the sample (rendered as drawings in the UI, not video).
SAMPLE_SCENES: list[dict[str, Any]] = [
    {"start": 0.0, "end": 9.0, "scene": "shelf", "caption": "Customer selects equipment from the shelf"},
    {"start": 9.0, "end": 14.0, "scene": "board", "caption": "Clerk checks the availability board"},
    {"start": 14.0, "end": 21.0, "scene": "binder", "caption": "Customer details written into the binder"},
    {"start": 21.0, "end": 33.0, "scene": "slip", "caption": "Rental slip: dates and deposit"},
    {"start": 33.0, "end": 46.0, "scene": "tag", "caption": "Tag flipped to “rented”"},
    {"start": 46.0, "end": 60.0, "scene": "return", "caption": "Item returned, tag back to “available”"},
]

SAMPLE_INVENTORY = [
    {"name": "Canon EOS R6 body", "type": "Camera", "notes": "Battery grip included"},
    {"name": "Sony FE 24–70mm f/2.8 GM", "type": "Lens", "notes": ""},
    {"name": "Aputure 300d II kit", "type": "Lighting", "notes": "Light dome in separate bag"},
    {"name": "Rode NTG5 shotgun mic", "type": "Audio", "notes": ""},
    {"name": "Manfrotto 504X tripod", "type": "Grip", "notes": ""},
]

SAMPLE_CUSTOMERS = [
    {"name": "Lena Hoffmann", "email": "lena.hoffmann@example.com", "phone": "+49 30 1234 5678"},
    {"name": "Marco Silva", "email": "marco.silva@example.com", "phone": "+351 21 987 6543"},
    {"name": "Aiko Tanaka", "email": "aiko.tanaka@example.com", "phone": ""},
]


def _ev(start: float, end: float, quote: str) -> dict[str, Any]:
    return {"kind": "transcript", "start": start, "end": end, "quote": quote}


def _p(source: str, *evidence: dict[str, Any], confidence: str | None = "high", note: str = "") -> dict[str, Any]:
    return {"source": source, "evidence": list(evidence), "confidence": confidence, "note": note}


def _field(key: str, label: str, type_: str = "text", *, required: bool = False, prov: dict[str, Any] | None = None, **extra: Any) -> dict[str, Any]:
    return {"key": key, "label": label, "type": type_, "required": required, "provenance": prov or _p("inferred", confidence="medium"), **extra}


def rental_definition(*, mode: str = "sample") -> dict[str, Any]:
    """The equipment rental workflow.

    mode="sample": example extraction awaiting review (provenance points at the sample narration).
    mode="template": a ready-made starting point, marked as human-authored and accepted.
    """
    T = SAMPLE_TRANSCRIPT

    def q(i: int) -> dict[str, Any]:
        return _ev(T[i]["start"], T[i]["end"], T[i]["text"])

    entities = [
        {
            "key": "item",
            "label": "Item",
            "plural_label": "Inventory",
            "description": "A piece of rentable equipment on the shelf.",
            "title_field": "name",
            "provenance": _p("observed", q(1), {"kind": "frame", "frame_index": 0, "quote": "Equipment shelf"}),
            "fields": [
                _field("name", "Name", required=True, prov=_p("observed", q(1))),
                _field("type", "Type", "enum", required=True, options=["Camera", "Lens", "Lighting", "Audio", "Grip"], prov=_p("inferred", q(1), confidence="medium", note="Categories inferred from the equipment shown.")),
                _field("availability", "Availability", "enum", required=True, options=["available", "rented", "maintenance"], default="available", prov=_p("narration", q(2))),
                _field("notes", "Notes", "long_text", prov=_p("inferred", confidence="low", note="Not mentioned; suggested for condition notes.")),
            ],
        },
        {
            "key": "customer",
            "label": "Customer",
            "plural_label": "Customers",
            "description": "A person who rents equipment.",
            "title_field": "name",
            "provenance": _p("narration", q(3)),
            "fields": [
                _field("name", "Name", required=True, prov=_p("narration", q(3))),
                _field("email", "Email", "email", required=True, prov=_p("narration", q(3))),
                _field("phone", "Phone", "phone", prov=_p("narration", q(3))),
            ],
        },
        {
            "key": "rental",
            "label": "Rental",
            "plural_label": "Rentals",
            "description": "A rental slip linking one customer to one item.",
            "title_field": "item",
            "provenance": _p("observed", q(4), {"kind": "frame", "frame_index": 3, "quote": "Rental slip"}),
            "fields": [
                _field("item", "Item", "reference", required=True, ref_entity="item", prov=_p("narration", q(7))),
                _field("customer", "Customer", "reference", required=True, ref_entity="customer", prov=_p("narration", q(7))),
                _field("start_date", "Start date", "date", required=True, default="$today", prov=_p("narration", q(4))),
                _field("expected_return", "Expected return", "date", required=True, prov=_p("narration", q(4))),
                _field("deposit", "Deposit", "money", required=True, prov=_p("narration", q(5))),
                _field("returned_on", "Returned on", "date", system=True, prov=_p("narration", q(8))),
            ],
        },
    ]

    state_machines = [
        {
            "entity": "rental",
            "field": "status",
            "initial": "active",
            "provenance": _p("narration", q(6), q(8)),
            "states": [
                {"key": "active", "label": "Active", "description": "Equipment is out with the customer.", "tone": "active"},
                {"key": "returned", "label": "Returned", "description": "Equipment is back and checked.", "tone": "success", "terminal": True},
            ],
            "transitions": [
                {
                    "key": "complete_return",
                    "label": "Complete return",
                    "from_states": ["active"],
                    "to_state": "returned",
                    "description": "Customer brings the item back; clerk checks it and marks the slip returned.",
                    "provenance": _p("narration", q(8)),
                }
            ],
        }
    ]

    rules = [
        {
            "id": "item_must_be_available",
            "kind": "ref_field_equals",
            "statement": "An unavailable item cannot be rented.",
            "params": {"entity": "rental", "on": "create", "ref_field": "item", "target_field": "availability", "equals": "available"},
            "provenance": _p("narration", q(2)),
        },
        {
            "id": "one_active_rental_per_item",
            "kind": "exclusive_reference",
            "statement": "An item cannot have two active rentals at the same time.",
            "params": {"entity": "rental", "ref_field": "item", "states": ["active"]},
            "provenance": _p("narration", q(7)),
        },
        {
            "id": "rental_marks_item_rented",
            "kind": "set_ref_field",
            "statement": "Starting a rental marks the item as rented.",
            "params": {"entity": "rental", "on": "create", "ref_field": "item", "target_field": "availability", "value": "rented"},
            "provenance": _p("narration", q(6)),
        },
        {
            "id": "return_releases_item",
            "kind": "set_ref_field",
            "statement": "Completing a return makes the item available again.",
            "params": {"entity": "rental", "on": "complete_return", "ref_field": "item", "target_field": "availability", "value": "available"},
            "provenance": _p("narration", q(9)),
        },
        {
            "id": "return_records_date",
            "kind": "set_field",
            "statement": "Completing a return records the return date.",
            "params": {"entity": "rental", "on": "complete_return", "field": "returned_on", "value": "$today"},
            "provenance": _p("narration", q(8)),
        },
        {
            "id": "deposit_not_negative",
            "kind": "min_value",
            "statement": "A deposit amount is recorded and cannot be negative.",
            "params": {"entity": "rental", "field": "deposit", "min": 0},
            "provenance": _p("narration", q(5)),
        },
        {
            "id": "return_after_start",
            "kind": "date_order",
            "statement": "The expected return date cannot be before the start date.",
            "params": {"entity": "rental", "start_field": "start_date", "end_field": "expected_return"},
            "provenance": _p("inferred", q(4), confidence="medium", note="Implied by recording a start and a promised return date."),
        },
        {
            "id": "late_fee_policy",
            "kind": "note",
            "statement": "Late returns may incur a fee.",
            "params": {},
            "provenance": _p("inferred", confidence="low", note="Common in rental businesses but never mentioned or shown."),
        },
    ]

    actions = [
        {"id": "select_item", "label": "Select item", "kind": "update", "entity": "item", "description": "Customer picks equipment from the shelf.", "provenance": _p("observed", q(1))},
        {"id": "register_customer", "label": "Register customer", "kind": "create", "entity": "customer", "description": "Name, email and phone go into the binder.", "provenance": _p("narration", q(3))},
        {"id": "start_rental", "label": "Start rental", "kind": "create", "entity": "rental", "description": "Fill the slip with dates and the deposit.", "provenance": _p("narration", q(4), q(5))},
        {"id": "complete_return", "label": "Complete return", "kind": "transition", "entity": "rental", "transition": "complete_return", "description": "Check the item and mark the slip returned.", "provenance": _p("narration", q(8))},
    ]

    stages = [
        {"id": "item_available", "label": "Available item", "kind": "start", "entity": "item", "state": "available", "description": "Item is on the shelf and free to rent.", "next": ["customer_registration"]},
        {"id": "customer_registration", "label": "Customer registration", "kind": "action", "action": "register_customer", "entity": "customer", "description": "Capture name, email and phone.", "next": ["rental_started"]},
        {"id": "rental_started", "label": "Rental started", "kind": "action", "action": "start_rental", "entity": "rental", "description": "Slip filled: dates and deposit. Item tag flips to rented.", "next": ["rental_active"]},
        {"id": "rental_active", "label": "Rental active", "kind": "state", "entity": "rental", "state": "active", "description": "Equipment is out with the customer.", "next": ["return_completed"]},
        {"id": "return_completed", "label": "Return completed", "kind": "action", "action": "complete_return", "entity": "rental", "description": "Item checked; return date written down.", "next": ["item_available_again"]},
        {"id": "item_available_again", "label": "Item available", "kind": "end", "entity": "item", "state": "available", "description": "Tag back to available; item back on the shelf.", "next": []},
    ]

    views = [
        {"key": "item_list", "label": "Inventory", "kind": "list", "entity": "item", "columns": ["name", "type", "availability"]},
        {"key": "customer_list", "label": "Customers", "kind": "list", "entity": "customer", "columns": ["name", "email", "phone"]},
        {"key": "rental_list", "label": "Rentals", "kind": "list", "entity": "rental", "columns": ["item", "customer", "start_date", "expected_return", "deposit", "status"]},
    ]

    questions = [
        {"id": "maintenance_flow", "question": "How does an item get into or out of maintenance?", "context": "The narration mentions maintenance as a reason an item can't be rented, but never shows the process."},
    ]

    defn: dict[str, Any] = {
        "schema_version": "1.0",
        "id": "equipment_rental",
        "name": "Equipment Rental Intake & Return",
        "description": "Counter workflow for renting equipment to customers against a deposit and taking it back.",
        "domain": "rental",
        "version": 1,
        "entities": entities,
        "state_machines": state_machines,
        "rules": rules,
        "actions": actions,
        "stages": stages,
        "views": views,
        "questions": questions,
    }

    if mode == "template":
        _mark_template(defn)
    return defn


def _mark_template(defn: dict[str, Any]) -> None:
    def walk(item: dict[str, Any]) -> None:
        if "provenance" in item:
            item["provenance"] = {"source": "human", "evidence": [], "confidence": None, "note": "From the built-in equipment rental template."}
            item["review"] = {"status": "accepted", "edited": False, "note": "Template default"}

    for e in defn["entities"]:
        walk(e)
        for f in e["fields"]:
            walk(f)
    for m in defn["state_machines"]:
        walk(m)
        for t in m["transitions"]:
            walk(t)
    for r in defn["rules"]:
        walk(r)
    for a in defn["actions"]:
        walk(a)
    defn["rules"] = [r for r in defn["rules"] if r["kind"] != "note"]
    defn["questions"] = []


def blank_definition(name: str) -> dict[str, Any]:
    from .schema import to_key

    return {
        "schema_version": "1.0",
        "id": to_key(name, "workflow"),
        "name": name,
        "description": "",
        "domain": "general",
        "version": 1,
        "entities": [],
        "state_machines": [],
        "rules": [],
        "actions": [],
        "stages": [],
        "views": [],
        "questions": [],
    }
