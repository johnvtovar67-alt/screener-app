// One explicit refresh publishes its completed React view in one continuation.
// This coordinates presentation only: it neither retries nor cancels server work.
export function createC1RefreshFrame(isCurrent){
  let operations=[],closed=false;
  return {
    defer(setter){return value=>{if(!closed)operations.push(()=>setter(value));};},
    publish(){
      if(closed)return false;
      closed=true;
      const pending=operations;operations=[];
      if(!isCurrent())return false;
      for(const operation of pending)operation();
      return true;
    },
    discard(){closed=true;operations=[];}
  };
}
