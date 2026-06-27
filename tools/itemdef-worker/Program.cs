// Headless s&box (appid 590830) itemdef worker using SteamKit2 — no Steam
// client needed, runs in GitHub Actions. Two modes:
//
//   dotnet run -- login    Interactive: log in once (password + Steam Guard),
//                          prints STEAM_ACCOUNT + STEAM_REFRESH_TOKEN to paste
//                          into GitHub secrets. Run this ONCE locally.
//
//   dotnet run             CI: logs on via STEAM_ACCOUNT + STEAM_REFRESH_TOKEN,
//                          gets the itemdef digest (Inventory.GetItemDefMeta),
//                          downloads the full archive over HTTP, maps the
//                          itemdef-sourced fields, and POSTs to
//                          {SITE_URL}/api/admin/enrich-from-steam (Bearer
//                          SBOXSKINS_ADMIN_KEY).
using System.Globalization;
using System.Text;
using System.Text.Json;
using SteamKit2;
using SteamKit2.Authentication;
using SteamKit2.Internal;

const uint APPID = 590830;
bool loginMode = args.Contains("login");

var steamClient = new SteamClient();
var manager = new CallbackManager(steamClient);
var steamUser = steamClient.GetHandler<SteamUser>()!;
var unified = steamClient.GetHandler<SteamUnifiedMessages>()!;
bool pumping = true;
_ = Task.Run(() =>
{
    while (pumping) manager.RunWaitCallbacks(TimeSpan.FromMilliseconds(150));
});

// ---------- LOGIN MODE ----------
if (loginMode)
{
    Console.Write("Steam account name: ");
    var user = Console.ReadLine()?.Trim() ?? "";
    Console.Write("Password: ");
    var pass = ReadPassword();

    var connected = new TaskCompletionSource();
    manager.Subscribe<SteamClient.ConnectedCallback>(_ => connected.TrySetResult());
    steamClient.Connect();
    await connected.Task;

    var auth = await steamClient.Authentication.BeginAuthSessionViaCredentialsAsync(
        new AuthSessionDetails
        {
            Username = user,
            Password = pass,
            IsPersistentSession = true,
            Authenticator = new UserConsoleAuthenticator(),
        });
    var poll = await auth.PollingWaitForResultAsync();

    Console.WriteLine("\n=== Save these as GitHub Actions repo secrets ===");
    Console.WriteLine($"STEAM_ACCOUNT        = {poll.AccountName}");
    Console.WriteLine($"STEAM_REFRESH_TOKEN  = {poll.RefreshToken}");
    pumping = false;
    return 0;
}

// ---------- CI RUN MODE ----------
string account = Env("STEAM_ACCOUNT");
string refreshToken = Env("STEAM_REFRESH_TOKEN");
string adminKey = Env("SBOXSKINS_ADMIN_KEY");
string site = Environment.GetEnvironmentVariable("SITE_URL") ?? "https://sboxskins.gg";
if (account == "" || refreshToken == "") return Fatal("STEAM_ACCOUNT + STEAM_REFRESH_TOKEN required.");
if (adminKey == "") return Fatal("SBOXSKINS_ADMIN_KEY required.");

var loggedOn = new TaskCompletionSource<EResult>();
manager.Subscribe<SteamClient.ConnectedCallback>(_ =>
    steamUser.LogOn(new SteamUser.LogOnDetails { Username = account, AccessToken = refreshToken }));
manager.Subscribe<SteamUser.LoggedOnCallback>(cb => loggedOn.TrySetResult(cb.Result));
manager.Subscribe<SteamClient.DisconnectedCallback>(_ =>
{
    if (!loggedOn.Task.IsCompleted) loggedOn.TrySetResult(EResult.NoConnection);
});
steamClient.Connect();

var result = await loggedOn.Task;
if (result != EResult.OK) return Fatal($"Logon failed: {result}");
Console.WriteLine($"Logged on as {account}.");

var inv = unified.CreateService<Inventory>();
var meta = await inv.GetItemDefMeta(new CInventory_GetItemDefMeta_Request { appid = APPID });
string digest = meta.Body.digest ?? "";
pumping = false;
steamClient.Disconnect();
Console.WriteLine($"itemdef digest: {digest}");
if (digest == "") return Fatal("no digest returned by GetItemDefMeta.");

using var http = new HttpClient();
var archiveUrl =
    $"https://api.steampowered.com/IGameInventory/GetItemDefArchive/v1/?appid={APPID}&digest={digest}";
var archiveJson = await http.GetStringAsync(archiveUrl);
List<Dictionary<string, JsonElement>> defs;
try
{
    defs = JsonSerializer.Deserialize<List<Dictionary<string, JsonElement>>>(archiveJson) ?? new();
}
catch
{
    Console.WriteLine($"[FATAL] archive not a JSON array. First 200 chars:\n{archiveJson[..Math.Min(200, archiveJson.Length)]}");
    return 1;
}
Console.WriteLine($"itemdefs in archive: {defs.Count}");

var entries = new List<object>();
foreach (var d in defs)
{
    var name = Str(d, "name");
    if (string.IsNullOrWhiteSpace(name)) continue;
    entries.Add(new
    {
        slug = Slugify(name),
        def = new
        {
            name,
            rarity = NullIfEmpty(Str(d, "rarity")),
            rarityColor = NullIfEmpty(Str(d, "name_color")),
            itemDefinitionId = IntId(d, "itemdefid"),
            release = ParseDate(Str(d, "date_created")),
            iconUrl = NullIfEmpty(Str(d, "icon_url")),
        },
    });
}
Console.WriteLine($"mapped {entries.Count} entries");

var body = JsonSerializer.Serialize(new { items = entries });
http.DefaultRequestHeaders.Add("Authorization", $"Bearer {adminKey}");
var resp = await http.PostAsync(
    $"{site}/api/admin/enrich-from-steam",
    new StringContent(body, Encoding.UTF8, "application/json"));
Console.WriteLine($"POST {site}/api/admin/enrich-from-steam -> {(int)resp.StatusCode}");
Console.WriteLine(await resp.Content.ReadAsStringAsync());
return resp.IsSuccessStatusCode ? 0 : 1;

// ---------- helpers ----------
static string Env(string k) => Environment.GetEnvironmentVariable(k)?.Trim() ?? "";

int Fatal(string msg)
{
    Console.WriteLine($"[FATAL] {msg}");
    pumping = false;
    return 1;
}

static string ReadPassword()
{
    var sb = new StringBuilder();
    ConsoleKeyInfo k;
    while ((k = Console.ReadKey(intercept: true)).Key != ConsoleKey.Enter)
    {
        if (k.Key == ConsoleKey.Backspace) { if (sb.Length > 0) sb.Length--; }
        else if (!char.IsControl(k.KeyChar)) sb.Append(k.KeyChar);
    }
    Console.WriteLine();
    return sb.ToString();
}

static string? Str(Dictionary<string, JsonElement> d, string k) =>
    d.TryGetValue(k, out var v)
        ? v.ValueKind switch
        {
            JsonValueKind.String => v.GetString(),
            JsonValueKind.Number => v.ToString(),
            _ => null,
        }
        : null;

static long? IntId(Dictionary<string, JsonElement> d, string k) =>
    long.TryParse(Str(d, k), out var n) ? n : null;

static string? NullIfEmpty(string? s) => string.IsNullOrEmpty(s) ? null : s;

static string? ParseDate(string? compact) =>
    !string.IsNullOrEmpty(compact) &&
    DateTime.TryParseExact(compact, "yyyyMMddTHHmmssZ", null,
        DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var dt)
        ? dt.ToString("o")
        : null;

static string Slugify(string name)
{
    var sb = new StringBuilder(name.Length);
    foreach (var c in name.ToLowerInvariant()) sb.Append(char.IsLetterOrDigit(c) ? c : '-');
    var s = sb.ToString();
    while (s.Contains("--")) s = s.Replace("--", "-");
    return s.Trim('-');
}
