import { NextResponse, type NextRequest } from "next/server";
import { signOut } from "@/auth";

function publicOrigin(req: NextRequest): string {
    const forwardedHost = req.headers.get("x-forwarded-host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return forwardedHost ? `${proto}://${forwardedHost}` : req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
    await signOut({ redirect: false });
    return NextResponse.redirect(new URL("/login", publicOrigin(req)));
}