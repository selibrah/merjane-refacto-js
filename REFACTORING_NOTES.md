# Refactoring Notes

## My Approach: Progressive Refactoring

### Step 1: Understand Before Changing
- Analyzed existing code and specification
- Identified 4 bugs by comparing behavior vs spec
- Wrote 14 tests FIRST to define expected behavior (TDD)

### Step 2: Option B — Extract to Service (Simple & Safe)
**Goal:** Move business logic out of controller into service.

```
Before: Controller has 88 lines with switch/case and business rules
After:  Controller is 48 lines, just calls ps.processProduct()
```

This approach:
- ✅ Fixes all bugs
- ✅ Makes code testable
- ✅ Respects SRP
- ⚠️ Still has switch/case (need to modify for new types)

### Step 3: Option C — Strategy Pattern (Advanced)
**Goal:** Apply Open/Closed Principle for extensibility.

```
Before: One service with switch/case per method
After:  One handler class per product type
```

New structure:
```
ProductService
├── handlers: [NormalHandler, SeasonalHandler, ExpirableHandler]
├── getHandler(product) → finds correct handler
└── processProduct(p) → delegates to handler
```

Benefits:
- Adding new product type = create new handler file (no existing code modified)
- Each handler is focused and independently testable
- No more switch statements

---

## Bugs Fixed

| Bug | Before | After |
|-----|--------|-------|
| NORMAL `leadTime=0` | Silent failure | Sends outOfStock notification |
| EXPIRABLE out of stock but not expired | Sent expiration notification | Sends delay notification |
| SEASONAL sets `available=0` | Destructive side effect | No side effect |
| EXPIRABLE sets `available=0` | Destructive side effect | No side effect |

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| TDD (tests first) | Prevents regression, defines expected behavior |
| Strategy Pattern | Open/Closed Principle — extensibility |
| Constructor injection | Testability — dependencies can be mocked |
| DB logic in ProductService | Handlers only decide, service orchestrates |

---

## Testing

```bash
pnpm test:unit       # 14 tests
pnpm test:integration  # 1 test
```

**All 15 tests pass.**
