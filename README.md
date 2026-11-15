# Halal Meat Shop — Partner Portal

A private portal for the four partners (Sam, Jasim, Tanvir, Ruble):

- **Balance sheets**: one sheet per day with sales (Cash, Novo, MyPOS, MB Way), expenses and the cash till. Totals, net and cash taken out are worked out automatically. Every sheet can be printed.
- **Investment**: shop cost €33,000 split between three investors (Sam, Tanvir on behalf of Tanvir & Jasim, Ruble), €11,000 each. It starts with the €10,000 deposit split equally; edit the entries if the real split was different.
- **Last changes**: who added, edited or deleted what, and when, with the exact before → after values (e.g. "Cash €360.00 → €380.00"). A red badge counts changes the other partners made since you last looked, a strip at the top shows the latest change, and you can filter by partner or by type.

Day one (14/11/2026) is already filled in.

## Deploy on Netlify

1. In Netlify choose **Add new site → Import an existing project** and pick this GitHub repository.
2. Leave the build command empty. `netlify.toml` already sets the publish folder (`public`) and the functions folder.
3. Deploy. The data is kept in **Netlify Blobs**, so you don't need a database.

> Dragging the folder onto Netlify Drop won't work: Drop doesn't run the `/api` function. Use the Git import or `netlify deploy`.

## Passwords

| Partner | Starting password |
|---------|-------------------|
| Sam     | `sam2026`         |
| Jasim   | `jasim2026`       |
| Tanvir  | `tanvir2026`      |
| Ruble   | `ruble2026`       |

**Each partner should change their password the first time they sign in** (click your name at the top right, then **Change password**).

You can also set the starting passwords in Netlify instead of using the ones above. Go to **Site configuration → Environment variables** and add:

```
PORTAL_PASSWORDS = sam=xxxx,jasim=xxxx,tanvir=xxxx,ruble=xxxx
```

A password changed inside the portal always takes priority over this variable.
