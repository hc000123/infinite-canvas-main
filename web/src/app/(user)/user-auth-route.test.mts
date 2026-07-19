import assert from "node:assert/strict";
import test from "node:test";

import { postLoginHref, protectedUserRouteState, userLoginHref } from "./user-auth-route.ts";

test("keeps the login page public", () => {
    assert.equal(protectedUserRouteState("/login", true, "", false), "public");
});

test("waits for authentication before rendering protected user pages", () => {
    assert.equal(protectedUserRouteState("/projects", false, "", false), "loading");
    assert.equal(protectedUserRouteState("/canvas/project-1", true, "", false), "redirect");
    assert.equal(protectedUserRouteState("/assets", true, "token", false), "redirect");
    assert.equal(protectedUserRouteState("/video", true, "token", true), "authenticated");
});

test("returns to the exact protected page after login", () => {
    assert.equal(userLoginHref("/canvas/project-1"), "/login?redirect=%2Fcanvas%2Fproject-1");
    assert.equal(postLoginHref("/canvas/project-1", "user"), "/canvas/project-1");
    assert.equal(postLoginHref("/admin", "user"), "/projects");
    assert.equal(postLoginHref("//example.com", "user"), "/projects");
});
