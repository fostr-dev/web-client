import { Alert, Box, Card, CircularProgress, Divider, Link, Typography } from "@mui/material";
import { Event, nip19 } from "nostr-tools";
import { useMemo } from "react";
import useNip05 from "../hooks/useNip05";
import usePromise from "../hooks/usePromise";
import useRefresh from "../hooks/useRefresh";
import { fetchEventsByIssue, replyToIssue } from "../nostr";
import { Viewer } from "./FileViewer";
import RepositoryIssueEditor from "./RepositoryIssueEditor";
import { Link as RouterLink } from "react-router-dom";

export function RepositoryIssueComment({
    comment,
    owner,
    name,
    ipfs_hash
}: {
    comment: Event,
    owner: string,
    name: string,
    ipfs_hash: string
}){
    const authorName = useNip05(comment.pubkey)

    return <Card sx={{
        width: "100%",
        padding: 2
    }} variant="outlined">
        <Link
            to={`/${nip19.npubEncode(comment.pubkey)}`}
            component={RouterLink}
        >
            <Typography variant="h6" textAlign="left" sx={{
                fontWeight: "bold",
                fontFamily: "'Overpass Mono', monospace",
                wordBreak: "break-all"
            }}>
                {authorName || nip19.npubEncode(comment.pubkey)}
            </Typography>
        </Link>
        <Typography variant="body1" sx={{
            textAlign: "left"
        }}>
            <Viewer file={{
                content: comment.content,
                path: `${ipfs_hash}/issue.md`,
                viewers: [["markdown", "markdown"]],
                too_large: false
            }} index={0} />
        </Typography>
    </Card>
}

export default function RepositoryIssue({
    issue,
    owner,
    name,
    ipfs_hash,
    isPullRequest = false
}: {
    issue: Event,
    owner: string,
    name: string,
    ipfs_hash: string,
    isPullRequest?: boolean
}){
    const authorName = useNip05(issue.pubkey)
    const title = useMemo(() => {
        return issue.tags.find(
            tag => tag[0] === (isPullRequest ? "m" : "c")
        )?.[1] || "Untitled"
    }, [issue.tags])
    
    const [issueEditorRefreshId, setIssueEditorRefreshId] = useRefresh()
    const [answersRefreshId, setAnswersRefreshId] = useRefresh()
    const [
        answers_loaded,
        answers,
        answers_error
    ] = usePromise(async () => {
        const comments = await fetchEventsByIssue(owner, name, issue.id)
        return comments.reverse()
    }, [issue.id, answersRefreshId])

    if(!answers_loaded)return <CircularProgress />
    if(answers_error)return <Alert severity="error">
        {String(answers_error)}
    </Alert>

    return <Box sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        alignItems: "center"
    }}>
        <Card sx={{
            width: "100%",
            padding: 2
        }} variant="outlined">
            <Typography variant="h4" fontWeight="bolder" textAlign="left">
                {title}
            </Typography>
            <Link
                to={`/${nip19.npubEncode(issue.pubkey)}`}
                component={RouterLink}
            >
                <Typography variant="h6" textAlign="left" sx={{
                    fontWeight: "bold",
                    fontFamily: "'Overpass Mono', monospace",
                    wordBreak: "break-all"
                }}>
                    {authorName || nip19.npubEncode(issue.pubkey)}
                </Typography>
            </Link>
            <Divider />
            <Typography variant="body1" sx={{
                textAlign: "left"
            }}>
                <Viewer file={{
                    content: isPullRequest ? 
                        `Wants to merge \`\`${issue.content}\`\` into this repository` : issue.content,
                    path: `${ipfs_hash}/issue.md`,
                    viewers: [["markdown", "markdown"]],
                    too_large: false
                }} index={0} />
            </Typography>
        </Card>
        {answers!.map(answer => <RepositoryIssueComment
            comment={answer}
            owner={owner}
            name={name}
            ipfs_hash={ipfs_hash}
            key={answer.id}
        />)}
        <Card sx={{
            width: "100%",
            padding: 2
        }} variant="outlined">
            <RepositoryIssueEditor
                onSubmit={async (title, content) => {
                    await replyToIssue(owner, name, issue.id, content)
                    setIssueEditorRefreshId()
                    setAnswersRefreshId()
                }}
                refreshId={issueEditorRefreshId}
            />
        </Card>
    </Box>
}