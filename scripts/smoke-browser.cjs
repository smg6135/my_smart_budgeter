// Run while scripts/dev.sh is serving the local emulator configuration.
const {createRequire}=require('node:module');
const path=require('node:path');
const appRequire=createRequire(path.resolve(__dirname,'../apps/mobile/package.json'));
const {chromium,expect}=appRequire('@playwright/test');
(async()=>{
 const browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const email='browser-smoke-'+Date.now()+'@example.com';
 await page.goto('http://localhost:8081');
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await page.getByLabel('Email',{exact:true}).fill(email);
 await page.getByLabel('Password',{exact:true}).fill('local-smoke-password123');
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await page.getByRole('button',{name:'Set budget',exact:true}).click();
 await page.getByLabel('Monthly take-home income').fill('1000');
 await page.getByRole('button',{name:'Save budget plan',exact:true}).click();
 await page.getByRole('button',{name:'Add expense',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill('Smoke coffee');
 await page.getByLabel('Amount',{exact:true}).fill('12.50');
 await page.getByRole('button',{name:'Save entry',exact:true}).click();
 await expect(page.getByText('$687.50',{exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByText('$687.50',{exact:true})).toBeVisible();
 const session=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('pocket-auth-session.v1')));
 const response=await page.request.get('http://localhost:8000/v1/me',{headers:{Authorization:'Bearer '+session.idToken}});
 expect(response.status()).toBe(200);
 await page.goto('http://localhost:8081/settings');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible();
 // Delete only the throwaway emulator account created by this test.
 const deleted=await page.request.post('http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:delete?key=fake',{data:{idToken:session.idToken}});
 expect(deleted.status()).toBe(200);
 await browser.close();
 console.log('Real FE + API + Auth emulator: signup, budget, expense, persistence and sign-out pass.');
})().catch(error=>{console.error(error);process.exit(1)});
