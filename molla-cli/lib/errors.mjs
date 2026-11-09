export class CliError extends Error {constructor(message,code='USAGE',exitCode=2,extra={}){super(message);Object.assign(this,{code,exitCode,...extra});}}
export function asCliError(error){
 if(error instanceof CliError||error.code==='USAGE')return error;
 if(error.status)return new CliError(error.message,error.status===403?'FORBIDDEN':error.status===404?'NOT_FOUND':'DOMAIN_ERROR',error.status===401?3:error.status===403?4:5,{status:error.status});
 return new CliError('Local command failed. Check file access, SQLite state and runtime configuration.','RUNTIME',5);
}
