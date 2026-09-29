import { NextResponse, type NextRequest } from "next/server";
import { signIn } from "@/auth";
import { isDevLoginEnabled } from "@/env";

function safeCallback(value: FormDataEntryValue | null): string {
    const url = typeof value === "string" ? value : "/";
    // Solo percorsi interni: niente open redirect
    return url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

function publicOrigin(req: NextRequest): string {
    const forwardedHost = req.headers.get("x-forwarded-host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return forwardedHost ? `${proto}://${forwardedHost}` : req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
    if (!isDevLoginEnabled()) {
        return NextResponse.json({ error: "Accesso sviluppo non attivo" }, { status: 403 });
    }

    const formData = await req.formData();
    const email = formData.get("email");
    const callbackUrl = safeCallback(formData.get("callbackUrl"));

    try {
        const result = await signIn("dev-login", {
            email,
            redirect: false,
            redirectTo: callbackUrl,
        });
        return NextResponse.redirect(new URL(result ?? callbackUrl, publicOrigin(req)));
    } catch (error) {
        const type = error instanceof Error ? error.name : "CredentialsSignin";
        return NextResponse.redirect(new URL(`/login?error=${type}`, publicOrigin(req)));
    }
}