import { Box, Card, Divider, Link, Typography } from "@mui/material";
import { nip19 } from "nostr-tools";
import { Fragment, useEffect, useMemo } from "react";
import { useParams, useSearchParams, Link as RouterLink } from "react-router-dom";
import useIsMobile from "../hooks/useIsMobile";
import useNip05 from "../hooks/useNip05";
import usePromise from "../hooks/usePromise";
import ipfs, { ls } from "../ipfs";
import { fetchEventsByAuthorAndRepository } from "../nostr";
import { getFileViewers, REPOSITORY_NAME_REGEX, VALIDE_FILE_URL_SCHEME } from "../utils";
import ErrorPage from "./ErrorPage";
import LoadingPage from "./LoadingPage";
import Editor, { useMonaco } from "@monaco-editor/react"
import editor_theme from "monaco-themes/themes/Brilliance Dull.json"
import { File } from "../components/FileViewer";

export default function RepositoryFileEditor(){
    const isMobile = useIsMobile()
    const monaco = useMonaco()
    useEffect(() => {
        monaco?.editor?.defineTheme("custom", editor_theme as any)
    }, [])
    const {
        owner: owner_raw,
        name: name_raw
    } = useParams<{
        owner: string
        name: string
    }>()
    const [searchParams] = useSearchParams({
        path: "/"
    })
    const path = useMemo(() => {
        const p = searchParams.get("path")
        if(!p?.startsWith("/"))return `/${p}`
        return p
    }, [searchParams])
    
    const owner = useMemo(() => {
        if(!owner_raw)return null
        const o = owner_raw.toLowerCase()
        if(/^[abcdef\d]{64}$/.test(o)){
            return o
        }
        try{
            const { type, data } = nip19.decode(o)
            if(type !== "npub"){
                return null
            }
            return data.toString()
        }catch(err){
            return null
        }
    }, [owner_raw])
    const name = useMemo(() => {
        if(!name_raw)return null
        const n = name_raw.toLowerCase()
        if(!REPOSITORY_NAME_REGEX.test(n))return null
        return n
    }, [name_raw])

    const owner_nip05 = useNip05(owner ?? undefined)

    const [
        events_loaded,
        events,
        events_error
    ] = usePromise(async () => {
        if(!owner)throw new Error("Invalid owner")
        if(!name)throw new Error("Invalid repository name")
        const events = await fetchEventsByAuthorAndRepository(owner, name)
        const validEvents = events.filter(event => {
            if(event.tags.find(t => t[0] === "p"))return false
            try{
                const url = new URL(event.content)
                if(!VALIDE_FILE_URL_SCHEME.has(url.protocol))return false
            }catch{
                return false
            }
            
            return true
        })
        
        if(!validEvents.length)throw new Error("This repository does not exist")

        // only events, made by the owner, counted as commits
        return validEvents
    }, [owner, name])
    const lastCommit = useMemo(() => {
        if(!events_loaded)return null
        if(events_error)return null
        if(!events?.length)return null
        return events[0]
    }, [events_loaded, events_error, events])
    const [
        files_loaded,
        files,
        files_error
    ] = usePromise(async () => {
        if(!lastCommit)return null
        if(isMobile)return null
        const url = new URL(lastCommit.content)
        switch(url.protocol){
            case "ipfs:": {
                const hash = url.pathname.slice(2) // remove leading slash
                const result = []
                const res = await ls(`${hash}${path}`)
                for(const file of res){
                    result.push(file)
                }
                if(!result.length){
                    return []
                }
                if(!result.find(e => !!e.name)){
                    throw new Error(`IPFS Hash ${hash} is not a directory`)
                }
                return result
            }
        }
        throw new Error(`Unsupported protocol: ${url.protocol}`)
    }, [lastCommit?.content, path, isMobile])
    const [
        file_loaded,
        file,
        file_error
    ] = usePromise<File>(async () => {
        if(!lastCommit)return null
        if(isMobile)return null
        const url = new URL(lastCommit.content)
        switch(url.protocol){
            case "ipfs:": {
                const hash = url.pathname.slice(2) // remove leading slash
                let p = `${hash}${path}`
                if(files_loaded && files?.length){
                    // see if there's a readme in the dir, and display it
                    const readme = files.find(e => /readme(\.(txt|md))?/.test(e.name?.toLowerCase()))
                    if(readme){
                        p = `${hash}${path}${readme.name}`
                    }else{
                        throw new Error(`IPFS Hash ${hash} is a directory`)
                    }
                }
                const viewers = getFileViewers(p)
                let content = null
                let tooLarge = false
                if(viewers.find(
                    e => e[0] === "text" ||
                        e[0] === "markdown"
                )){
                    let result = []
                    let totalSize = 0
                    for await (const chunk of ipfs.cat(p)){
                        result.push(chunk)
                        totalSize += chunk.length

                        // limit to 1MB
                        if(totalSize > 1024 * 1024){
                            result = []
                            tooLarge = true
                            break
                        }
                    }
                    
                    content = new TextDecoder().decode(Buffer.concat(result))
                }
                return {
                    path: p,
                    viewers,
                    content,
                    too_large: tooLarge
                } as File
            }
        }
        throw new Error(`Unsupported protocol: ${url.protocol}`)
    }, [lastCommit?.content, path, files_loaded, files, isMobile])

    if(!owner)return <ErrorPage
        title="Invalid repository"
        reason="The repository owner public key is invalid"
    />
    if(!name)return <ErrorPage
        title="Invalid repository"
        reason="The repository name is invalid"
    />

    if(!events_loaded || !(file_loaded || files_loaded))return <LoadingPage/>
    if(events_error)return <ErrorPage
        title="Failed to load repository"
        reason={events_error.message}
    />
    if(isMobile)return <ErrorPage
        title="Mobile not supported"
        reason="File Editor is not supported on mobile devices"
    />
    if(file_error)return <ErrorPage
        title="Failed to load file"
        reason={file_error.message}
    />
    if(!lastCommit)return <ErrorPage
        title="Repository not found"
        reason="The repository does not exist"
    />

    return <Box sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: 4,
        alignItems: "center",
        minHeight: "var(--app-height)",
        width: "100%",
        textAlign: "center"
    }}>
        { /* repository header */}
        <Box sx={{
            display: "flex",
            flexDirection: "row",
            gap: 1,
            justifyContent: "start",
            width: "100%",
            flexWrap: "wrap"
        }}>
            { /* repository name */}
            <Box sx={{
                display: "flex",
                flexDirection: "row",
                gap: 1
            }}>
                <Link
                    to={`/${nip19.npubEncode(owner)}`}
                    component={RouterLink}
                >
                    <Typography
                        variant="body1"
                        fontFamily="'Overpass Mono', monospace"
                        sx={{
                            wordBreak: "break-all"
                        }}
                    >
                        {owner_nip05 || nip19.npubEncode(owner)}
                    </Typography>
                </Link>
                <Typography variant="body1" color="grey">
                    /
                </Typography>
                <Link
                    to={`/${nip19.npubEncode(owner)}/${name}`}
                    component={RouterLink}
                >
                    <Typography
                        variant="body1"
                        fontFamily="'Overpass Mono', monospace"
                        sx={{
                            wordBreak: "break-all"
                        }}
                    >
                        {name}
                    </Typography>
                </Link>
            </Box>
        </Box>

        <Divider sx={{
            width: "100%",
        }} />

        <Box sx={{
            width: "100%",
            //maxWidth: "1200px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            alignItems: "center"
        }}>
            { /* Directory header */}
            <Box sx={{
                display: "flex",
                flexDirection: "row",
                gap: 1,
                justifyContent: "start",
                width: "100%",
                flexWrap: "wrap"
            }}>
                { /* Path */}
                <Box sx={{
                    display: "flex",
                    flexDirection: "row",
                    gap: 1
                }}>
                    {
                        [".", ...path.split("/")].map((p, i, arr) => {
                            if(!p)return null
                            const p2 = arr.slice(0, i + 1).slice(1).join("/") || "/"
                            return <Fragment key={p2}>
                                <Link
                                    to={`/${nip19.npubEncode(owner)}/${name}?path=${p2}`}
                                    component={RouterLink}
                                >
                                    <Typography
                                        variant="body1"
                                        fontFamily="'Overpass Mono', monospace"
                                        sx={{
                                            wordBreak: "break-all"
                                        }}
                                    >
                                        {p}
                                    </Typography>
                                </Link>
                                {i !== arr.length - 1 && <Typography variant="body1" color="grey">
                                    /
                                </Typography>}
                            </Fragment>
                        })
                    }
                </Box>
            </Box>

            <Divider sx={{
                width: "100%",
            }} />
        </Box>

        { /* File editor */}
        {file && <Box sx={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            alignItems: "center"
        }}>
            <Editor
                defaultValue={file.content! || ""}
                language={file.viewers.find(e => e[0] === "text")?.[1] || "plaintext"}
                height="calc(var(--app-height) - 200px)"
                theme="custom"
            />
        </Box>}
    </Box>
}