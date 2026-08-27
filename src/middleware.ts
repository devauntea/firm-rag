import { NextRequest, NextResponse } from 'next/server'

// Gates the whole app behind HTTP Basic auth so only testers with the
// shared credentials can reach it. This is a demo gate, not real
// authentication: it says "you may look at this deployment," not "you are
// this person." The per-user permission model inside the app is separate
// and unaffected by it.
export function middleware(req: NextRequest) {
    const expectedUser = process.env.DEMO_USER
    const expectedPassword = process.env.DEMO_PASSWORD

    // If no credentials are configured, don't lock anyone out (local dev).
    if (!expectedUser || !expectedPassword) return NextResponse.next()

    const header = req.headers.get('authorization')

    if (header?.startsWith('Basic ')) {
        const decoded = atob(header.slice(6))
        const separator = decoded.indexOf(':')
        const user = decoded.slice(0, separator)
        const password = decoded.slice(separator + 1)

        if (user === expectedUser && password === expectedPassword) {
            return NextResponse.next()
        }
    }

    return new NextResponse('Authentication required.', {
        status: 401,
        headers: {
            'WWW-Authenticate': 'Basic realm="Firm Document Assistant", charset="UTF-8"',
        },
    })
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
