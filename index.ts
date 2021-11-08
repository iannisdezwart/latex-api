import * as fs from 'fs'
import { createAPI, readBody } from '@iannisz/node-api-kit'
import { randomBytes } from 'crypto'
import { exec } from 'child_process'
import * as replacestream from 'replacestream'

const PORT = +process.argv[2] || 3000

const wrapLatex = (latex: string) => `\
\\documentclass[12pt]{article}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{amsfonts}
\\usepackage{xcolor}
\\usepackage{siunitx}
\\usepackage[utf8]{inputenc}
\\thispagestyle{empty}
\\begin{document}
${ latex.trim() }
\\end{document}
`

const compileLatex = (
	tempDir: string
) => new Promise<void>((resolve, reject) => {
	const cmd = `cd ${ tempDir } && latex file.tex && dvisvgm --no-fonts file.dvi`
	const child = exec(cmd)
	let exited = false

	child.on('error', reject)

	child.on('exit', () => {
		resolve()
		exited = true
	})

	setTimeout(() => {
		if (!exited) {
			child.kill()
			reject('Timeout')
		}
	}, 5000)
})

const api = createAPI(PORT)

api.post('/render', async (req, res) => {
	const latex = wrapLatex(await readBody(req))
	const id = randomBytes(16).toString('hex')
	const tempDir = `temp/${ id }`

	// Store the LaTeX equation into a file.

	fs.mkdirSync(tempDir, { recursive: true })
	fs.writeFileSync(`${ tempDir }/file.tex`, latex)

	// Compile the LaTex equation to an svg file.

	try {
		await compileLatex(tempDir)
	}
	catch {
		res.statusCode = 500
		res.end('Error while compiling LaTeX equation')
		fs.rmdirSync(tempDir, { recursive: true })
		return
	}

	// Stream the svg output to the client.

	fs
		.createReadStream(`${ tempDir }/file.svg`)
		.pipe(replacestream(/<\?xml.*\?>\n/g, ''))
		.pipe(replacestream(/<!--.*-->\n/g, ''))
		.pipe(replacestream(/xlink:href/g, 'href'))
		.pipe(res)

	// Delete the temp directory.

	res.on('finish', () => {
		fs.rmdirSync(tempDir, { recursive: true })
	})
})