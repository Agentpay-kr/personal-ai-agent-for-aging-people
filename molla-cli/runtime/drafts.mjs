/** Deterministic offline message drafts. No model, memory instructions or external calls. */
export function messageDraft(request){
 const quoted=request.match(/[“"]([^”"]+)[”"]/);
 if(quoted)return quoted[1];
 let body=request.replace(/^.*?(?:에게|한테)\s*/,'').replace(/\s*(?:알려줘|전해줘|전달해줘|보내줘|작성해줘)[.!?]?$/,'').trim();
 if(/^(?:안부\s*)?(?:메시지|문자|카톡)(?:를|로)?$/.test(body)||body==='안부')return '안녕하세요. 잘 지내고 계세요? 안부 전해요.';
 // Common reported-speech forms. Unknown wording remains editable by supplying draft.
 const endings=[[/간다고$/,'가요.'],[/한다고$/,'해요.'],[/있다고$/,'있어요.'],[/없다고$/,'없어요.'],[/라고$/,'']];
 for(const [pattern,replacement] of endings)if(pattern.test(body))return body.replace(pattern,replacement);
 return body||request;
}
